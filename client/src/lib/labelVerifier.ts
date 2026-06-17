/**
 * TTB Label Verification Engine
 *
 * Performs rule-based extraction and verification of TTB-required label fields
 * against OCR-extracted text from uploaded label images.
 *
 * TTB regulatory references:
 *  - Distilled Spirits: 27 CFR Part 5 (labeling), 27 CFR 5.37 (ABV tolerance ±0.15%)
 *  - Wine:              27 CFR Part 4 (labeling), 27 CFR 4.36 (ABV tolerance ±0.14%)
 *  - Beer/Malt:         27 CFR Part 7 (labeling), 27 CFR 7.71 (ABV tolerance ±0.30%)
 *  - Govt Warning:      27 CFR Part 16 (ABLA 1988) — exact text required
 *  - Country of Origin: 27 CFR 5.36 / 4.36 / 7.29 (imports must declare)
 */

export interface LabelField {
  field: string;
  labelValue: string | null;
  applicationValue: string | null;
  status: "pass" | "fail" | "warning" | "not_found" | "not_required";
  note?: string;
}

export interface VerificationResult {
  overallResult: "pass" | "fail" | "warning";
  score: number;
  extractedText: string;
  beverageType: "distilled_spirits" | "wine" | "beer" | "unknown";
  fields: LabelField[];
  issues: string[];
  warnings: string[];
}

// ── Government Warning (ABLA 1988, 27 CFR Part 16) ────────────────────────────
const GOVERNMENT_WARNING_EXACT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const GOVERNMENT_WARNING_NORMALIZED = GOVERNMENT_WARNING_EXACT.replace(/\s+/g, " ").trim();

// ── TTB ABV tolerances by beverage type ──────────────────────────────────────
const ABV_TOLERANCE: Record<string, number> = {
  distilled_spirits: 0.15,   // 27 CFR 5.37
  wine: 0.14,                // 27 CFR 4.36(b)
  beer: 0.30,                // 27 CFR 7.71(b)
  unknown: 0.30,             // use the most lenient as a safe default
};

// ── Fuzzy string matching ──────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - levenshtein(longer, shorter)) / longerLength;
}

/**
 * Strict fuzzy match — same as fuzzyMatch but WITHOUT the substring shortcut.
 * Use for fields where a truncated value (e.g. missing state) must NOT score
 * artificially high just because one string is a prefix of the other.
 * "Old Tom Distillery, Bardstown," vs "Old Tom Distillery, Bardstown, KY"
 * would score 0.9 with fuzzyMatch (substring) but ~0.93 Levenshtein —
 * except that’s still high. The real guard is the segment-level state check.
 */
function strictFuzzyMatch(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1.0;
  // NO includes shortcut — always use Levenshtein
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - levenshtein(longer, shorter)) / longerLength;
}

function levenshtein(s: string, t: string): number {
  const m = s.length, n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s[i - 1] === t[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Numeric extraction helpers ────────────────────────────────────────────────

/**
 * Extract a numeric ABV percentage from a string like:
 *   "45% Alc./Vol.", "45% Alc/Vol", "45% ABV", "45 Proof" (÷2), "45%"
 * Returns null if no number found.
 */
function parseAbv(s: string): number | null {
  if (!s) return null;
  const str = s.trim();

  // Proof → ABV: "90 Proof" → 45
  const proofM = str.match(/(\d{1,3}(?:\.\d{1,2})?)\s*Proof/i);
  if (proofM) return parseFloat(proofM[1]) / 2;

  // Standard: "45% Alc", "45%ABV", "45.5%", "45 % alc/vol"
  const pctM = str.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (pctM) return parseFloat(pctM[1]);

  // Bare number that looks like an ABV (1–99)
  const bareM = str.match(/^(\d{1,2}(?:\.\d{1,2})?)$/);
  if (bareM) {
    const n = parseFloat(bareM[1]);
    if (n >= 1 && n <= 99) return n;
  }

  return null;
}

/**
 * Extract a numeric volume from a string like "750 mL", "1 L", "750ml", "1.75L"
 * Always returns value in mL for comparison. Returns null if not found.
 */
function parseVolumeMl(s: string): number | null {
  if (!s) return null;
  const str = s.trim();

  // Liters: "1 L", "1.75 L", "1L"
  const lM = str.match(/(\d+(?:\.\d+)?)\s*L(?:iters?)?(?!\s*[Ss])/i);
  if (lM && !str.toLowerCase().includes('ml')) return parseFloat(lM[1]) * 1000;

  // Milliliters: "750 mL", "750ml"
  const mlM = str.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (mlM) return parseFloat(mlM[1]);

  // Fluid ounces: "25.4 fl oz"
  const ozM = str.match(/(\d+(?:\.\d+)?)\s*fl\.?\s*oz/i);
  if (ozM) return parseFloat(ozM[1]) * 29.5735;

  return null;
}

// ── Beverage type detection ────────────────────────────────────────────────────

function detectBeverageType(text: string): "distilled_spirits" | "wine" | "beer" | "unknown" {
  const t = text.toLowerCase();
  if (/whiskey|whisky|bourbon|scotch|vodka|gin|rum|tequila|mezcal|brandy|cognac|distilled spirit/.test(t))
    return "distilled_spirits";
  if (/\bwine\b|chardonnay|cabernet|merlot|pinot|sauvignon|riesling|champagne|prosecco|chianti|port\b|sherry/.test(t))
    return "wine";
  if (/\bbeer\b|\bale\b|\blager\b|stout|porter|\bipa\b|india pale|malt beverage|\bbrew/.test(t))
    return "beer";
  return "unknown";
}

// ── Field extractors (work on raw OCR text) ────────────────────────────────────

interface ExtractedFields {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;   // raw string as found on label
  netContents: string | null;      // raw string as found on label
  nameAddress: string | null;
  countryOfOrigin: string | null;
  govtWarning: string | null;
}

export interface ApplicationData {
  brandName?: string;
  classType?: string;
  alcoholContent?: string;
  netContents?: string;
  nameAddress?: string;
  countryOfOrigin?: string;
  beverageType?: string;
}

function extractFields(text: string): ExtractedFields {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const full = text;
  const upper = text.toUpperCase();

  // ── Brand Name ──
  // On real labels: first prominent text line in ALL CAPS or mixed case at the top.
  // OCR may introduce minor noise; we look for the longest ALL-CAPS line that
  // isn't a known field header.
  let brandName: string | null = null;
  const skipPatterns = /^(GOVERNMENT|BOTTLED|DISTILLED|PRODUCED|IMPORTED|PRODUCT\s+OF|NET|ALCOHOL|ABV|CLASS|TYPE|WARNING)/i;
  const allCapsLines = lines.filter(l =>
    l.length > 2 &&
    l === l.toUpperCase() &&
    /[A-Z]/.test(l) &&
    !skipPatterns.test(l) &&
    !/^\d/.test(l)
  );
  if (allCapsLines.length > 0) {
    // Prefer the longest ALL-CAPS line (most likely to be the brand)
    brandName = allCapsLines.reduce((a, b) => a.length >= b.length ? a : b);
  } else {
    // Fallback: first non-numeric, non-field line
    const fallback = lines.find(l =>
      l.length > 2 &&
      !skipPatterns.test(l) &&
      !/^\d/.test(l)
    );
    if (fallback) brandName = fallback;
  }

  // ── Class / Type designation ──
  let classType: string | null = null;
  const knownTypes = [
    /Kentucky\s+Straight\s+Bourbon\s+Whiskey/i,
    /Straight\s+Bourbon\s+Whiskey/i,
    /Blended\s+Scotch\s+Whisky/i,
    /Single\s+Malt\s+Scotch\s+Whisky/i,
    /American\s+Vodka/i,
    /London\s+Dry\s+Gin/i,
    /(?:White|Gold|Dark|Spiced|Aged)\s+Rum/i,
    /(?:Blanco|Reposado|Añejo|Extra\s+Añejo)\s+Tequila/i,
    /(?:American|Tennessee|Rye)\s+Whiskey/i,
    /Brandy/i,
    /Cognac/i,
    /Cabernet\s+Sauvignon/i,
    /Chardonnay/i,
    /India\s+Pale\s+Ale/i,
    /(?:Lager|Pilsner)\s+Beer/i,
    /Distilled\s+Spirit/i,
  ];
  for (const pat of knownTypes) {
    const m = full.match(pat);
    if (m) { classType = m[0]; break; }
  }
  // Fallback: line after "Class/Type:" label (OCR may have picked up the form header)
  if (!classType) {
    const ctM = full.match(/class\s*[\/]?\s*type\s*:?\s*([A-Za-z][A-Za-z\s,]+)/i);
    if (ctM) classType = ctM[1].trim();
  }

  // ── Alcohol Content ──
  // Match patterns common on printed labels
  let alcoholContent: string | null = null;
  const abvPatterns = [
    /(\d{1,3}(?:\.\d{1,2})?)\s*%\s*Alc(?:ohol)?\.?\s*\/?\s*Vol\.?/i,
    /Alc(?:ohol)?\.?\s*\/?\s*Vol\.?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%/i,
    /(\d{1,3}(?:\.\d{1,2})?)\s*%\s*ABV/i,
    /ABV\s*:?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%/i,
    /(\d{1,3}(?:\.\d{1,2})?)\s*%\s*(?:by\s+)?(?:alcohol|alc)/i,
    /(\d{1,3}(?:\.\d)?)(?:\s*)Proof/i,
  ];
  for (const pat of abvPatterns) {
    const m = full.match(pat);
    if (m) { alcoholContent = m[0].trim(); break; }
  }

  // ── Net Contents ──
  let netContents: string | null = null;
  const netPatterns = [
    /(\d+(?:\.\d+)?)\s*mL/i,
    /(\d+(?:\.\d+)?)\s*L(?:iters?)?\b(?!\s*abel)/i,  // avoid matching "Label"
    /(\d+(?:\.\d+)?)\s*fl\.?\s*oz/i,
  ];
  for (const pat of netPatterns) {
    const m = full.match(pat);
    if (m) { netContents = m[0].trim(); break; }
  }

  // ── Name & Address ──
  // Match the bottler/producer line that appears on the label.
  // IMPORTANT: capture only up to the first newline \n so that subsequent
  // label lines ("Product of Scotland", "GOVERNMENT WARNING", etc.) are
  // not accidentally pulled into the address value.
  // After capturing, also trim at any known field-boundary keywords so that
  // single-line OCR output (all text joined with spaces) is handled too.
  let nameAddress: string | null = null;
  const bottlerM = full.match(
    /(?:Bottled|Distilled|Produced|Imported|Blended)\s+(?:by|for|at|in)\s+([^\n\r]{5,120})/i
  );
  if (bottlerM) {
    let addr = bottlerM[1].trim();
    // Hard-stop at any known next-field keyword that may appear on the same
    // OCR line when the label text has been flattened into a single string.
    addr = addr.replace(
      /\s*(?:Product\s+of|Imported\s+from|Country\s+of\s+Origin|GOVERNMENT\s+WARNING|Net\s+Contents?|Alc\.?\s*\/|\d{1,3}%|\d{3,4}\s*m[Ll]).*$/i,
      ""
    ).trim();
    // Collapse any internal whitespace runs left by OCR
    addr = addr.replace(/\s+/g, " ").trim();
    if (addr.length >= 3) nameAddress = addr;
  }

  // ── Country of Origin ──
  let countryOfOrigin: string | null = null;
  const originPatterns = [
    /Product\s+of\s+([A-Za-z][A-Za-z\s]{2,30})/i,
    /Imported\s+from\s+([A-Za-z][A-Za-z\s]{2,30})/i,
    /Country\s+of\s+Origin\s*:?\s*([A-Za-z][A-Za-z\s]{2,30})/i,
  ];
  for (const pat of originPatterns) {
    const m = full.match(pat);
    if (m) {
      const val = m[1].trim().split(/\n/)[0].trim();
      // Ignore domestic placeholders that OCR might carry in
      if (!/^(domestic|n\/a|none|united states|usa?)$/i.test(val)) {
        countryOfOrigin = val;
        break;
      }
    }
  }

  // ── Government Warning ──
  let govtWarning: string | null = null;
  const warnIdx = upper.indexOf("GOVERNMENT WARNING");
  if (warnIdx !== -1) {
    govtWarning = full.substring(warnIdx, warnIdx + 400).trim();
  }

  return { brandName, classType, alcoholContent, netContents, nameAddress, countryOfOrigin, govtWarning };
}

// ── Government Warning verifier ───────────────────────────────────────────────

function verifyGovtWarning(extracted: string | null): LabelField {
  if (!extracted) {
    return {
      field: "Government Warning Statement",
      labelValue: null,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "fail",
      note: "Government Warning Statement not found on label. Required by ABLA on all containers ≥0.5% ABV.",
    };
  }

  const normalized = extracted.replace(/\s+/g, " ").trim();
  const startsCorrectly = /^GOVERNMENT WARNING:/i.test(normalized);
  const similarity = fuzzyMatch(normalized, GOVERNMENT_WARNING_NORMALIZED);

  if (!startsCorrectly) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "fail",
      note: `"GOVERNMENT WARNING:" must appear in ALL CAPS. Found: "${normalized.substring(0, 50)}…"`,
    };
  }

  if (similarity >= 0.92) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "pass",
      note: similarity < 1.0 ? "Minor OCR variation detected — statement is compliant." : undefined,
    };
  } else if (similarity >= 0.78) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "warning",
      note: `Warning text may be altered or truncated (similarity: ${Math.round(similarity * 100)}%). Agent review recommended.`,
    };
  } else {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "fail",
      note: `Warning statement does not match required text (similarity: ${Math.round(similarity * 100)}%). Must match 27 CFR Part 16 exactly.`,
    };
  }
}

// ── Main verification function ─────────────────────────────────────────────────

export function verifyLabel(
  labelText: string,
  applicationData?: ApplicationData
): VerificationResult {
  const beverageType = detectBeverageType(
    labelText + " " + (applicationData?.classType || "") + " " + (applicationData?.beverageType || "")
  );
  const extracted = extractFields(labelText);
  const fields: LabelField[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  // ── Brand Name ────────────────────────────────────────────────────────────
  if (applicationData?.brandName) {
    // COLA applications must declare brand names in ALL CAPS (27 CFR 5.34).
    // If the raw application value contains any lowercase letters that is itself
    // a compliance issue — tracked via appHasLower so we can flag it separately.
    const rawAppBrand = applicationData.brandName.trim();
    const appBrand    = rawAppBrand.toUpperCase();
    const labelBrand  = (extracted.brandName || "").toUpperCase();
    const appHasLower = rawAppBrand !== appBrand; // true when app value is not all-caps

    // Compare uppercased label against uppercased application for similarity.
    // We do NOT compare raw strings through fuzzyMatch because fuzzyMatch
    // internally lowercases both sides — that would make "DISTILLERy" score
    // identically to "DISTILLERY" and hide the typo.
    const sim = fuzzyMatch(labelBrand, appBrand);

    // TTB requires the brand name on the label to match the approved COLA application
    // exactly (27 CFR 5.34). We allow a small tolerance (≥97%) only for OCR noise
    // (e.g. "O" vs "0", minor kerning artifacts). A single missing or substituted
    // letter is a compliance failure, not OCR noise.
    //
    // Additional check: if character counts differ by more than 2, it cannot be
    // a pure OCR artifact — flag as fail regardless of similarity score.
    const lenDiff = Math.abs(appBrand.length - labelBrand.length);
    const exactEnough = sim >= 0.97 && lenDiff <= 2;
    const closeEnough = sim >= 0.88 && lenDiff <= 2;

    if (!extracted.brandName) {
      fields.push({ field: "Brand Name", labelValue: null, applicationValue: rawAppBrand, status: "fail", note: "Brand name not found on label." });
      issues.push("Brand name not found on label");
    } else if (appHasLower && exactEnough) {
      // Label matches application content but application is not all-caps —
      // the brand name on the COLA document itself has a casing error.
      fields.push({
        field: "Brand Name",
        labelValue: extracted.brandName,
        applicationValue: rawAppBrand,
        status: "warning",
        note: `Brand name content matches but application value "${rawAppBrand}" is not in ALL CAPS as required by 27 CFR 5.34. Application must be corrected.`,
      });
      warnings.push("Brand name casing error in application — agent review required");
    } else if (exactEnough) {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: rawAppBrand, status: "pass" });
    } else if (closeEnough) {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: rawAppBrand, status: "warning", note: `Brand name near-match — similarity: ${Math.round(sim * 100)}%, length difference: ${lenDiff} character(s). Manual review required (27 CFR 5.34).` });
      warnings.push("Brand name near-match — agent review required");
    } else {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: rawAppBrand, status: "fail", note: `Brand name mismatch. Label: "${extracted.brandName}", Application: "${rawAppBrand}". Similarity: ${Math.round(sim * 100)}% (required ≥97% with ≤2 char difference per 27 CFR 5.34).` });
      issues.push(`Brand name mismatch: label "${extracted.brandName}" vs application "${rawAppBrand}"`);
    }
  } else {
    fields.push({
      field: "Brand Name",
      labelValue: extracted.brandName,
      applicationValue: null,
      status: extracted.brandName ? "pass" : "not_found",
      note: extracted.brandName ? "Detected on label (no application value to compare)." : "Brand name not detected on label.",
    });
    if (!extracted.brandName) warnings.push("Brand name not detected");
  }

  // ── Class / Type Designation ───────────────────────────────────────────────
  if (applicationData?.classType) {
    // colaParser may store classType with a "Designation: " prefix from the PDF
    // form field label. Strip it before comparing so we only compare the actual
    // designation value (e.g. "Kentucky Straight Bourbon Whiskey").
    const rawAppClassType = applicationData.classType.trim();
    const appClassType = rawAppClassType.replace(/^Designation:\s*/i, "").trim();

    const sim = fuzzyMatch(extracted.classType || "", appClassType);
    // Length-difference guard: a missing or substituted word (e.g. "Kentuck" vs
    // "Kentucky") can still score >= 0.90 in a long string because Levenshtein
    // distance of 1 over 33 chars = 0.97. Requiring the character counts to be
    // within 2 of each other before passing catches single-word truncation errors.
    const ctLenDiff = Math.abs((extracted.classType || "").length - appClassType.length);
    if (!extracted.classType) {
      fields.push({ field: "Class/Type Designation", labelValue: null, applicationValue: appClassType, status: "fail", note: "Class/type designation not found on label." });
      issues.push("Class/type not found");
    } else if (sim >= 0.97 && ctLenDiff === 0) {
      // Near-identical with same length — only possible OCR noise (e.g. 0 vs O).
      fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: appClassType, status: "pass" });
    } else if (sim >= 0.90 && ctLenDiff === 0) {
      // Same length, high similarity, but a letter substitution (different char).
      // Flag for agent review — could be a real designation error.
      fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: appClassType, status: "warning", note: `Class/type near-match (similarity: ${Math.round(sim * 100)}%, same length). A substituted character was detected — agent review required.` });
      warnings.push("Class/type near-match — agent review required");
    } else {
      fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: appClassType, status: "fail", note: `Class/type mismatch. Label: "${extracted.classType}", Application: "${appClassType}". Similarity: ${Math.round(sim * 100)}%, length difference: ${ctLenDiff} character(s). Required to match approved COLA application (27 CFR 5.35).` });
      issues.push(`Class/type mismatch: label "${extracted.classType}" vs application "${appClassType}"`);
    }
  } else {
    fields.push({
      field: "Class/Type Designation",
      labelValue: extracted.classType,
      applicationValue: null,
      status: extracted.classType ? "pass" : "not_found",
      note: extracted.classType ? undefined : "Not detected on label.",
    });
    if (!extracted.classType) warnings.push("Class/type not detected");
  }

  // ── Alcohol Content (ABV) — NUMERIC comparison with TTB tolerances ─────────
  if (applicationData?.alcoholContent) {
    const appAbv = parseAbv(applicationData.alcoholContent);
    const labelAbv = parseAbv(extracted.alcoholContent || "");
    const tolerance = ABV_TOLERANCE[beverageType] ?? 0.30;

    if (labelAbv === null) {
      fields.push({
        field: "Alcohol Content (ABV)",
        labelValue: null,
        applicationValue: applicationData.alcoholContent,
        status: "fail",
        note: `ABV not found on label. Application declares: ${applicationData.alcoholContent}. TTB requires prominent display (27 CFR 5.32).`,
      });
      issues.push("ABV not found on label");
    } else if (appAbv === null) {
      // Can't parse the application value — fallback to fuzzy
      const sim = fuzzyMatch(extracted.alcoholContent || "", applicationData.alcoholContent);
      fields.push({
        field: "Alcohol Content (ABV)",
        labelValue: extracted.alcoholContent,
        applicationValue: applicationData.alcoholContent,
        status: sim >= 0.85 ? "pass" : "warning",
        note: sim >= 0.85 ? undefined : "Could not parse ABV numerically — agent review required.",
      });
    } else {
      const diff = Math.abs(labelAbv - appAbv);
      if (diff <= tolerance) {
        fields.push({
          field: "Alcohol Content (ABV)",
          labelValue: extracted.alcoholContent,
          applicationValue: applicationData.alcoholContent,
          status: "pass",
          note: diff === 0 ? undefined : `Within TTB tolerance (±${tolerance}% for ${beverageType.replace("_", " ")}). Difference: ${diff.toFixed(2)}%.`,
        });
      } else {
        fields.push({
          field: "Alcohol Content (ABV)",
          labelValue: extracted.alcoholContent,
          applicationValue: applicationData.alcoholContent,
          status: "fail",
          note: `ABV mismatch — Label: ${labelAbv}%, Application: ${appAbv}%. Difference ${diff.toFixed(2)}% exceeds TTB tolerance of ±${tolerance}% (27 CFR ${beverageType === "wine" ? "4.36" : beverageType === "beer" ? "7.71" : "5.37"}).`,
        });
        issues.push(`ABV mismatch: label ${labelAbv}% vs application ${appAbv}%`);
      }
    }
  } else {
    fields.push({
      field: "Alcohol Content (ABV)",
      labelValue: extracted.alcoholContent,
      applicationValue: null,
      status: extracted.alcoholContent ? "pass" : "not_found",
      note: extracted.alcoholContent ? undefined : "ABV not detected on label.",
    });
    if (!extracted.alcoholContent) warnings.push("ABV not detected");
  }

  // ── Net Contents — NUMERIC comparison ────────────────────────────────────
  if (applicationData?.netContents) {
    const appVol = parseVolumeMl(applicationData.netContents);
    const labelVol = parseVolumeMl(extracted.netContents || "");
    // TTB allows ±3% net contents variance per NIST Handbook 133
    const volTolerance = appVol !== null ? appVol * 0.03 : 0;

    if (labelVol === null) {
      fields.push({
        field: "Net Contents",
        labelValue: null,
        applicationValue: applicationData.netContents,
        status: "fail",
        note: `Net contents not found on label. Application declares: ${applicationData.netContents}.`,
      });
      issues.push("Net contents not found on label");
    } else if (appVol === null) {
      // Fallback to fuzzy
      const sim = fuzzyMatch(extracted.netContents || "", applicationData.netContents);
      fields.push({
        field: "Net Contents",
        labelValue: extracted.netContents,
        applicationValue: applicationData.netContents,
        status: sim >= 0.85 ? "pass" : "warning",
        note: sim >= 0.85 ? undefined : "Could not parse volume numerically — agent review required.",
      });
    } else {
      const diff = Math.abs(labelVol - appVol);
      if (diff <= volTolerance || diff < 1) {  // <1mL rounding tolerance
        fields.push({
          field: "Net Contents",
          labelValue: extracted.netContents,
          applicationValue: applicationData.netContents,
          status: "pass",
        });
      } else {
        fields.push({
          field: "Net Contents",
          labelValue: extracted.netContents,
          applicationValue: applicationData.netContents,
          status: "fail",
          note: `Net contents mismatch — Label: ${extracted.netContents}, Application: ${applicationData.netContents}. Difference: ${diff.toFixed(0)} mL.`,
        });
        issues.push(`Net contents mismatch: label "${extracted.netContents}" vs application "${applicationData.netContents}"`);
      }
    }
  } else {
    fields.push({
      field: "Net Contents",
      labelValue: extracted.netContents,
      applicationValue: null,
      status: extracted.netContents ? "pass" : "not_found",
      note: extracted.netContents ? undefined : "Net contents not detected.",
    });
    if (!extracted.netContents) warnings.push("Net contents not detected");
  }

  // ── Name & Address ────────────────────────────────────────────────────────
  if (applicationData?.nameAddress) {
    if (!extracted.nameAddress) {
      fields.push({ field: "Name & Address (Bottler/Producer)", labelValue: null, applicationValue: applicationData.nameAddress, status: "fail", note: "Bottler/producer name & address not found on label." });
      issues.push("Name & address not found");
    } else {
      // Three-part check for Name & Address (TTB 27 CFR 5.35 / 4.32 / 7.22):
      //
      // 1. COMPANY NAME (first comma segment) — must match at >=92% to pass.
      //    "New River Distillery" vs "Old Tom Distillery" => FAIL.
      //
      // 2. STATE segment (last comma segment, trimmed) — must match at >=90%.
      //    A wrong or MISSING state is always a FAIL.
      //    "KY" vs "TX" => FAIL. "KY" vs "" (missing) => FAIL.
      //
      // 3. FULL STRING — use strictFuzzyMatch (no substring shortcut) so a
      //    truncated app value like "Old Tom Distillery, Bardstown," doesn't
      //    score 0.9 against the complete label address via the includes path.
      //
      //   PASS:    fullSim >= 0.88 AND companySim >= 0.92 AND stateSim >= 0.90
      //   WARNING: fullSim >= 0.75 AND companySim >= 0.80 AND stateSim >= 0.80
      //   FAIL:    below WARNING

      const fullSim    = strictFuzzyMatch(extracted.nameAddress, applicationData.nameAddress);
      const labelSegs  = extracted.nameAddress.split(",").map((s: string) => s.trim());
      const appSegs    = applicationData.nameAddress.split(",").map((s: string) => s.trim());
      const labelCompany = labelSegs[0] || "";
      const appCompany   = appSegs[0] || "";
      const labelState   = labelSegs[labelSegs.length - 1] || "";
      const appState     = appSegs[appSegs.length - 1] || "";
      const companySim   = fuzzyMatch(labelCompany, appCompany);
      // State must match closely; if either side has no state segment, score 0
      const stateSim     = (labelState === "" && appState === "")
        ? 1.0
        : (labelState === "" || appState === "")
          ? 0.0   // one side missing state entirely — hard fail
          : fuzzyMatch(labelState, appState);

      const isPass    = fullSim >= 0.88 && companySim >= 0.92 && stateSim >= 0.90;
      const isWarning = fullSim >= 0.75 && companySim >= 0.80 && stateSim >= 0.80;

      if (isPass) {
        fields.push({ field: "Name & Address (Bottler/Producer)", labelValue: extracted.nameAddress, applicationValue: applicationData.nameAddress, status: "pass" });
      } else if (isWarning) {
        fields.push({
          field: "Name & Address (Bottler/Producer)",
          labelValue: extracted.nameAddress,
          applicationValue: applicationData.nameAddress,
          status: "warning",
          note: `Name/address near-match (full: ${Math.round(fullSim * 100)}%, company: ${Math.round(companySim * 100)}%, state: ${Math.round(stateSim * 100)}%). Possible discrepancy — agent review required.`,
        });
        warnings.push("Name/address variation — agent review required");
      } else {
        // Build a specific note identifying which segment(s) failed
        const failReasons: string[] = [];
        if (companySim < 0.80)
          failReasons.push(`company name mismatch: "${labelCompany}" vs "${appCompany}" (${Math.round(companySim * 100)}%)`);
        if (stateSim < 0.80) {
          const stateMsg = appState === ""
            ? `state missing from application (label shows "${labelState}")`
            : labelState === ""
              ? `state missing from label (application shows "${appState}")`
              : `state mismatch: label "${labelState}" vs application "${appState}"`;
          failReasons.push(stateMsg);
        }
        if (failReasons.length === 0)
          failReasons.push(`address similarity too low (full: ${Math.round(fullSim * 100)}%)`);
        fields.push({
          field: "Name & Address (Bottler/Producer)",
          labelValue: extracted.nameAddress,
          applicationValue: applicationData.nameAddress,
          status: "fail",
          note: `Name/address mismatch — ${failReasons.join("; ")}. Required to match approved COLA application (27 CFR 5.35).`,
        });
        issues.push(`Name/address mismatch: label "${extracted.nameAddress}" vs application "${applicationData.nameAddress}"`);
      }
    }
  } else {
    fields.push({
      field: "Name & Address (Bottler/Producer)",
      labelValue: extracted.nameAddress,
      applicationValue: null,
      status: extracted.nameAddress ? "pass" : "not_found",
      note: extracted.nameAddress ? undefined : "Bottler/producer address not detected.",
    });
    if (!extracted.nameAddress) warnings.push("Name & address not detected");
  }

  // ── Country of Origin (27 CFR 5.36 / 4.36 / 7.29 — imports only) ─────────
  if (applicationData?.countryOfOrigin) {
    const appCountry = applicationData.countryOfOrigin.trim();
    if (!extracted.countryOfOrigin) {
      fields.push({
        field: "Country of Origin",
        labelValue: null,
        applicationValue: appCountry,
        status: "fail",
        note: `Country of origin "${appCountry}" not found on label. Required for imported products (27 CFR 5.36).`,
      });
      issues.push(`Country of origin not found (expected: ${appCountry})`);
    } else {
      const sim = fuzzyMatch(extracted.countryOfOrigin, appCountry);
      if (sim >= 0.82) {
        fields.push({ field: "Country of Origin", labelValue: extracted.countryOfOrigin, applicationValue: appCountry, status: "pass" });
      } else {
        fields.push({
          field: "Country of Origin",
          labelValue: extracted.countryOfOrigin,
          applicationValue: appCountry,
          status: "fail",
          note: `Country mismatch. Label: "${extracted.countryOfOrigin}", Application: "${appCountry}".`,
        });
        issues.push(`Country of origin mismatch`);
      }
    }
  } else {
    // No country declared — check if label implies import
    const tl = labelText.toLowerCase();
    if ((tl.includes("product of") || tl.includes("imported from") || tl.includes("imported by")) && extracted.countryOfOrigin) {
      fields.push({
        field: "Country of Origin",
        labelValue: extracted.countryOfOrigin,
        applicationValue: null,
        status: "warning",
        note: `Label indicates imported product from "${extracted.countryOfOrigin}". Verify country of origin is declared in the COLA application.`,
      });
      warnings.push("Import detected — verify country of origin in application");
    }
    // Domestic: no check needed
  }

  // ── Government Warning ────────────────────────────────────────────────────
  const govtField = verifyGovtWarning(extracted.govtWarning);
  fields.push(govtField);
  if (govtField.status === "fail") issues.push("Government warning non-compliant");
  if (govtField.status === "warning") warnings.push("Government warning needs review");

  // ── Score & overall result ────────────────────────────────────────────────
  const passCount  = fields.filter(f => f.status === "pass").length;
  const failCount  = fields.filter(f => f.status === "fail").length;
  const warnCount  = fields.filter(f => f.status === "warning").length;
  const totalChecked = fields.filter(f => f.status !== "not_required").length;

  const score = totalChecked > 0
    ? Math.round(((passCount + warnCount * 0.5) / totalChecked) * 100)
    : 0;

  const overallResult: "pass" | "fail" | "warning" =
    failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass";

  return { overallResult, score, extractedText: labelText, beverageType, fields, issues, warnings };
}
