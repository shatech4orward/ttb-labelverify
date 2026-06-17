/**
 * TTB Label Verification Engine
 * 
 * Performs rule-based extraction and verification of TTB-required label fields.
 * Uses fuzzy matching for case-insensitive/formatting-tolerant comparisons per 
 * Dave Morrison's feedback about "Stone's Throw" vs "STONE'S THROW" nuance.
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

// Exact government warning statement as required by ABLA
const GOVERNMENT_WARNING_EXACT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const GOVERNMENT_WARNING_NORMALIZED = GOVERNMENT_WARNING_EXACT.replace(/\s+/g, " ").trim();

/**
 * Fuzzy string similarity — tolerates case, punctuation, extra whitespace.
 * Returns 0-1 similarity score.
 */
function fuzzyMatch(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Levenshtein distance as fallback
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  const editDistance = levenshtein(longer, shorter);
  return (longerLength - editDistance) / longerLength;
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

/**
 * Detect beverage type from label text
 */
function detectBeverageType(text: string): "distilled_spirits" | "wine" | "beer" | "unknown" {
  const t = text.toLowerCase();
  if (t.match(/whiskey|whisky|bourbon|scotch|vodka|gin|rum|tequila|brandy|cognac|distilled spirit/)) return "distilled_spirits";
  if (t.match(/wine|chardonnay|cabernet|merlot|pinot|sauvignon|riesling|champagne|prosecco/)) return "wine";
  if (t.match(/beer|ale|lager|stout|porter|ipa|india pale|malt beverage|brew/)) return "beer";
  return "unknown";
}

/**
 * Extract fields from OCR/AI text using pattern matching
 */
function extractFields(text: string, applicationData?: Partial<ApplicationData>): ExtractedFields {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const fullText = text;
  const upperText = text.toUpperCase();

  // Brand name: typically first prominent text or after "Brand:"
  let brandName: string | null = null;
  const brandMatch = fullText.match(/brand\s*(?:name)?\s*:?\s*([A-Z][A-Z\s'&.,-]+)/i);
  if (brandMatch) {
    brandName = brandMatch[1].trim();
  } else if (lines.length > 0) {
    // First non-warning line in ALL CAPS is likely brand
    const brandLine = lines.find(l => l === l.toUpperCase() && l.length > 2 && !l.startsWith("GOVERNMENT"));
    if (brandLine) brandName = brandLine;
  }

  // Class/Type designation
  let classType: string | null = null;
  const classMatch = fullText.match(/class\s*(?:\/\s*type)?\s*:?\s*([A-Za-z][A-Za-z\s,]+(?:whiskey|whisky|bourbon|scotch|vodka|gin|rum|wine|beer|ale|brandy|spirits?)[A-Za-z\s,]*)/i);
  if (classMatch) {
    classType = classMatch[1].trim();
  } else {
    // Look for known class designations
    const classPatterns = [
      /Kentucky Straight Bourbon Whiskey/i,
      /Blended Scotch Whisky/i,
      /American Vodka/i,
      /London Dry Gin/i,
      /White Rum/i,
      /Cabernet Sauvignon/i,
      /Chardonnay/i,
      /India Pale Ale/i,
      /Lager Beer/i,
      /Distilled Spirits?/i,
    ];
    for (const pattern of classPatterns) {
      const m = fullText.match(pattern);
      if (m) { classType = m[0]; break; }
    }
  }

  // Alcohol content
  let alcoholContent: string | null = null;
  const abvMatch = fullText.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%\s*(?:Alc(?:ohol)?(?:\/Vol(?:ume)?)?|ABV|by\s+volume)/i);
  if (abvMatch) {
    alcoholContent = abvMatch[0].trim();
  }
  const proofMatch = fullText.match(/(\d{1,3}(?:\.\d)?)\s*Proof/i);
  if (proofMatch && !alcoholContent) {
    alcoholContent = proofMatch[0].trim();
  }

  // Net contents
  let netContents: string | null = null;
  const netMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(mL|ml|L|liters?|fl\.?\s*oz|oz)/i);
  if (netMatch) {
    netContents = netMatch[0].trim();
  }

  // Name and address
  let nameAddress: string | null = null;
  const bottlerMatch = fullText.match(/(?:Bottled|Distilled|Produced|Imported)\s+(?:by|for|at)\s+([A-Za-z][A-Za-z0-9\s,.'&-]+(?:,\s*[A-Z]{2})?)/i);
  if (bottlerMatch) {
    nameAddress = bottlerMatch[1].trim();
  }

  // Country of origin
  let countryOfOrigin: string | null = null;
  const originMatch = fullText.match(/(?:Product|Imported)\s+(?:of|from)\s+([A-Za-z\s]+)/i);
  if (originMatch) {
    countryOfOrigin = originMatch[1].trim();
  }

  // Government warning
  let govtWarning: string | null = null;
  const warningIdx = upperText.indexOf("GOVERNMENT WARNING");
  if (warningIdx !== -1) {
    govtWarning = fullText.substring(warningIdx, warningIdx + 350).trim();
  }

  return { brandName, classType, alcoholContent, netContents, nameAddress, countryOfOrigin, govtWarning };
}

interface ExtractedFields {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
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

/**
 * Verify government warning statement compliance
 */
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

  // Check "GOVERNMENT WARNING" is in ALL CAPS and effectively starts the statement
  const startsCorrectly = /^GOVERNMENT WARNING:/.test(normalized);

  // Check the full text match
  const similarity = fuzzyMatch(normalized, GOVERNMENT_WARNING_NORMALIZED);

  if (!startsCorrectly) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "fail",
      note: `"GOVERNMENT WARNING:" must appear in ALL CAPS and bold. Found: "${normalized.substring(0, 40)}..."`,
    };
  }

  if (similarity >= 0.95) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "pass",
      note: similarity < 1.0 ? "Minor formatting variation detected but statement is compliant." : undefined,
    };
  } else if (similarity >= 0.80) {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "warning",
      note: `Warning text may have been altered (similarity: ${Math.round(similarity * 100)}%). Agent review recommended.`,
    };
  } else {
    return {
      field: "Government Warning Statement",
      labelValue: extracted,
      applicationValue: GOVERNMENT_WARNING_EXACT,
      status: "fail",
      note: `Warning statement does not match required text (similarity: ${Math.round(similarity * 100)}%). Must match exactly.`,
    };
  }
}

/**
 * Main verification function
 */
export function verifyLabel(
  labelText: string,
  applicationData?: ApplicationData
): VerificationResult {
  const beverageType = detectBeverageType(labelText);
  const extracted = extractFields(labelText, applicationData);
  const fields: LabelField[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  // --- Brand Name ---
  if (applicationData?.brandName) {
    const sim = fuzzyMatch(extracted.brandName || "", applicationData.brandName);
    if (!extracted.brandName) {
      fields.push({ field: "Brand Name", labelValue: null, applicationValue: applicationData.brandName, status: "fail", note: "Brand name not found on label." });
      issues.push("Brand name not found");
    } else if (sim >= 0.95) {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: applicationData.brandName, status: "pass" });
    } else if (sim >= 0.75) {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: applicationData.brandName, status: "warning", note: `Minor formatting difference (e.g., capitalization). Agent judgment required. Similarity: ${Math.round(sim * 100)}%.` });
      warnings.push("Brand name formatting difference");
    } else {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: applicationData.brandName, status: "fail", note: `Brand name mismatch. Label: "${extracted.brandName}", Application: "${applicationData.brandName}".` });
      issues.push("Brand name mismatch");
    }
  } else {
    if (extracted.brandName) {
      fields.push({ field: "Brand Name", labelValue: extracted.brandName, applicationValue: null, status: "pass", note: "Found on label (no application value to compare)." });
    } else {
      fields.push({ field: "Brand Name", labelValue: null, applicationValue: null, status: "not_found", note: "Brand name not detected on label." });
      warnings.push("Brand name not detected");
    }
  }

  // --- Class/Type ---
  if (applicationData?.classType) {
    const sim = fuzzyMatch(extracted.classType || "", applicationData.classType);
    if (!extracted.classType) {
      fields.push({ field: "Class/Type Designation", labelValue: null, applicationValue: applicationData.classType, status: "fail", note: "Class/type designation not found." });
      issues.push("Class/type not found");
    } else if (sim >= 0.85) {
      fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: applicationData.classType, status: "pass" });
    } else {
      fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: applicationData.classType, status: "warning", note: "Class/type may not match exactly. Review required." });
      warnings.push("Class/type variation");
    }
  } else {
    fields.push({ field: "Class/Type Designation", labelValue: extracted.classType, applicationValue: null, status: extracted.classType ? "pass" : "not_found", note: extracted.classType ? undefined : "Not detected on label." });
    if (!extracted.classType) warnings.push("Class/type not detected");
  }

  // --- Alcohol Content ---
  if (applicationData?.alcoholContent) {
    const sim = fuzzyMatch(extracted.alcoholContent || "", applicationData.alcoholContent);
    if (!extracted.alcoholContent) {
      fields.push({ field: "Alcohol Content (ABV)", labelValue: null, applicationValue: applicationData.alcoholContent, status: "fail", note: "Alcohol content not found on label." });
      issues.push("Alcohol content not found");
    } else if (sim >= 0.85) {
      fields.push({ field: "Alcohol Content (ABV)", labelValue: extracted.alcoholContent, applicationValue: applicationData.alcoholContent, status: "pass" });
    } else {
      fields.push({ field: "Alcohol Content (ABV)", labelValue: extracted.alcoholContent, applicationValue: applicationData.alcoholContent, status: "fail", note: `ABV mismatch. Label: "${extracted.alcoholContent}", Application: "${applicationData.alcoholContent}".` });
      issues.push("ABV mismatch");
    }
  } else {
    fields.push({ field: "Alcohol Content (ABV)", labelValue: extracted.alcoholContent, applicationValue: null, status: extracted.alcoholContent ? "pass" : "not_found" });
    if (!extracted.alcoholContent) warnings.push("ABV not detected");
  }

  // --- Net Contents ---
  if (applicationData?.netContents) {
    const sim = fuzzyMatch(extracted.netContents || "", applicationData.netContents);
    if (!extracted.netContents) {
      fields.push({ field: "Net Contents", labelValue: null, applicationValue: applicationData.netContents, status: "fail", note: "Net contents not found on label." });
      issues.push("Net contents not found");
    } else if (sim >= 0.85) {
      fields.push({ field: "Net Contents", labelValue: extracted.netContents, applicationValue: applicationData.netContents, status: "pass" });
    } else {
      fields.push({ field: "Net Contents", labelValue: extracted.netContents, applicationValue: applicationData.netContents, status: "warning", note: "Net contents format may differ. Review." });
      warnings.push("Net contents variation");
    }
  } else {
    fields.push({ field: "Net Contents", labelValue: extracted.netContents, applicationValue: null, status: extracted.netContents ? "pass" : "not_found" });
    if (!extracted.netContents) warnings.push("Net contents not detected");
  }

  // --- Name & Address ---
  fields.push({
    field: "Name & Address (Bottler/Producer)",
    labelValue: extracted.nameAddress,
    applicationValue: applicationData?.nameAddress || null,
    status: extracted.nameAddress ? "pass" : "not_found",
    note: extracted.nameAddress ? undefined : "Bottler/producer name & address not detected.",
  });
  if (!extracted.nameAddress) warnings.push("Name & address not detected");

  // --- Country of Origin (imports only) ---
  const isImport = beverageType !== "unknown" || (labelText.toLowerCase().includes("import") || labelText.toLowerCase().includes("product of"));
  if (isImport || applicationData?.countryOfOrigin) {
    fields.push({
      field: "Country of Origin",
      labelValue: extracted.countryOfOrigin,
      applicationValue: applicationData?.countryOfOrigin || null,
      status: extracted.countryOfOrigin ? "pass" : "warning",
      note: extracted.countryOfOrigin ? undefined : "Country of origin not detected (required for imports).",
    });
  }

  // --- Government Warning ---
  const govtField = verifyGovtWarning(extracted.govtWarning);
  fields.push(govtField);
  if (govtField.status === "fail") issues.push("Government warning non-compliant");
  if (govtField.status === "warning") warnings.push("Government warning needs review");

  // --- Compute overall result ---
  const passCount = fields.filter(f => f.status === "pass").length;
  const failCount = fields.filter(f => f.status === "fail").length;
  const warnCount = fields.filter(f => f.status === "warning").length;
  const totalChecked = fields.filter(f => f.status !== "not_required").length;

  const score = totalChecked > 0 ? Math.round(((passCount + warnCount * 0.5) / totalChecked) * 100) : 0;

  let overallResult: "pass" | "fail" | "warning";
  if (failCount > 0) {
    overallResult = "fail";
  } else if (warnCount > 0) {
    overallResult = "warning";
  } else {
    overallResult = "pass";
  }

  return {
    overallResult,
    score,
    extractedText: labelText,
    beverageType,
    fields,
    issues,
    warnings,
  };
}
