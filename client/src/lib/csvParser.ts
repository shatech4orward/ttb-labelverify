/**
 * CSV Application Data Parser
 *
 * Accepts a pre-formatted CSV file (one row per COLA application) and parses
 * it into ApplicationData objects for use in batch verification.
 *
 * Expected CSV format (header row required):
 *   label_file, brand_name, class_type, alcohol_content, net_contents,
 *   name_address, country_of_origin, beverage_type, cola_number
 *
 * label_file is used to match the CSV row to an uploaded image file.
 * If label_file is omitted the system falls back to fuzzy brand-name matching
 * against uploaded image filenames.
 */

import { ApplicationData } from "./labelVerifier";

export interface CSVRow extends ApplicationData {
  rowIndex: number;
  rawLine: string;
  labelFile?: string;      // optional filename to match against uploaded image
  colaNumber?: string;     // optional COLA reference number for display
  batchName?: string;      // optional per-row batch grouping
}

export interface CSVParseResult {
  rows: CSVRow[];
  errors: string[];
  headerFound: boolean;
}

// Canonical column header aliases
const COLUMN_ALIASES: Record<string, keyof CSVRow> = {
  // label_file
  label_file: "labelFile",
  "label file": "labelFile",
  labelfile: "labelFile",
  filename: "labelFile",
  file: "labelFile",
  image: "labelFile",
  "image file": "labelFile",

  // cola_number
  cola_number: "colaNumber",
  cola: "colaNumber",
  "cola number": "colaNumber",
  "application number": "colaNumber",
  "app number": "colaNumber",
  colanumber: "colaNumber",
  reference: "colaNumber",

  // brand_name
  brand_name: "brandName",
  brand: "brandName",
  "brand name": "brandName",
  brandname: "brandName",

  // class_type
  class_type: "classType",
  class: "classType",
  type: "classType",
  "class/type": "classType",
  "class type": "classType",
  designation: "classType",
  classtype: "classType",

  // alcohol_content
  alcohol_content: "alcoholContent",
  alcohol: "alcoholContent",
  abv: "alcoholContent",
  "alcohol content": "alcoholContent",
  alcoholcontent: "alcoholContent",
  "alc/vol": "alcoholContent",

  // net_contents
  net_contents: "netContents",
  net: "netContents",
  "net contents": "netContents",
  size: "netContents",
  volume: "netContents",
  netcontents: "netContents",

  // name_address
  name_address: "nameAddress",
  "name and address": "nameAddress",
  "name & address": "nameAddress",
  bottler: "nameAddress",
  producer: "nameAddress",
  nameaddress: "nameAddress",

  // country_of_origin
  country_of_origin: "countryOfOrigin",
  country: "countryOfOrigin",
  origin: "countryOfOrigin",
  "country of origin": "countryOfOrigin",
  countryoforigin: "countryOfOrigin",

  // beverage_type
  beverage_type: "beverageType",
  "beverage type": "beverageType",
  category: "beverageType",
  beveragetype: "beverageType",
  "product type": "beverageType",
};

function normalizeBeverageType(raw: string): string {
  const t = raw.toLowerCase().trim();
  if (t.includes("spirit") || t.includes("whiskey") || t.includes("whisky") ||
      t.includes("vodka") || t.includes("gin") || t.includes("rum") ||
      t.includes("tequila") || t.includes("bourbon") || t.includes("brandy")) {
    return "distilled_spirits";
  }
  if (t.includes("wine") || t.includes("champagne") || t.includes("cider") ||
      t.includes("mead") || t.includes("sake")) {
    return "wine";
  }
  if (t.includes("beer") || t.includes("ale") || t.includes("lager") ||
      t.includes("stout") || t.includes("malt")) {
    return "beer";
  }
  return raw;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(csvText: string): CSVParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["CSV file is empty."], headerFound: false };
  }

  const errors: string[] = [];
  const firstRow = parseCSVLine(lines[0]);
  const headerCandidates = firstRow.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_\s/&.]/g, "").trim()
  );
  const hasHeader = headerCandidates.some((h) => COLUMN_ALIASES[h] !== undefined);

  if (!hasHeader) {
    errors.push(
      "No recognizable header row found. First row should contain column names like: label_file, brand_name, class_type, alcohol_content, net_contents, name_address, country_of_origin, beverage_type"
    );
    return { rows: [], errors, headerFound: false };
  }

  const columnMap: Record<number, keyof CSVRow> = {};
  headerCandidates.forEach((h, i) => {
    const key = COLUMN_ALIASES[h];
    if (key) columnMap[i] = key;
  });

  const rows: CSVRow[] = [];
  const dataLines = lines.slice(1);

  dataLines.forEach((line, idx) => {
    const rowNumber = idx + 2;
    const values = parseCSVLine(line);
    const row: Partial<CSVRow> = { rowIndex: rowNumber, rawLine: line };

    Object.entries(columnMap).forEach(([colIdx, key]) => {
      const val = values[parseInt(colIdx)]?.trim();
      if (val) {
        if (key === "beverageType") {
          (row as any)[key] = normalizeBeverageType(val);
        } else {
          (row as any)[key] = val;
        }
      }
    });

    if (!row.brandName) {
      errors.push(`Row ${rowNumber}: Skipped — brand_name is empty.`);
      return;
    }

    rows.push(row as CSVRow);
  });

  return { rows, errors, headerFound: true };
}

// ----------------------------------------------------------------
// Matching logic — pairs CSV rows to uploaded image Files
// ----------------------------------------------------------------

export type MatchStatus = "matched" | "unmatched_csv" | "unmatched_image";

export interface MatchedPair {
  csvRow: CSVRow;
  imageFile: File | null;
  matchStatus: MatchStatus;
  matchMethod: "label_file" | "brand_fuzzy" | "none";
}

export interface UnmatchedImage {
  file: File;
  matchStatus: "unmatched_image";
}

export interface MatchResult {
  pairs: MatchedPair[];
  unmatchedImages: UnmatchedImage[];
}

/** Strip extension and normalize a filename for comparison */
function normalizeFilename(name: string): string {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[_\-\s]+/g, " ").trim();
}

/** Simple token overlap score for brand-name vs filename fuzzy match */
function brandFuzzyScore(brand: string, filename: string): number {
  const bTokens = brand.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const fNorm = filename.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  if (bTokens.length === 0) return 0;
  const matches = bTokens.filter((t) => fNorm.includes(t));
  return matches.length / bTokens.length;
}

export function matchPairs(csvRows: CSVRow[], imageFiles: File[]): MatchResult {
  const usedImages = new Set<number>();
  const pairs: MatchedPair[] = [];

  // Pass 1: explicit label_file column match
  for (const row of csvRows) {
    if (row.labelFile) {
      const target = row.labelFile.toLowerCase().trim();
      const idx = imageFiles.findIndex(
        (f, i) => !usedImages.has(i) && f.name.toLowerCase() === target
      );
      if (idx !== -1) {
        usedImages.add(idx);
        pairs.push({ csvRow: row, imageFile: imageFiles[idx], matchStatus: "matched", matchMethod: "label_file" });
        continue;
      }
      // Try without extension
      const targetNoExt = normalizeFilename(target);
      const idx2 = imageFiles.findIndex(
        (f, i) => !usedImages.has(i) && normalizeFilename(f.name) === targetNoExt
      );
      if (idx2 !== -1) {
        usedImages.add(idx2);
        pairs.push({ csvRow: row, imageFile: imageFiles[idx2], matchStatus: "matched", matchMethod: "label_file" });
        continue;
      }
      // label_file specified but no match found — mark as unmatched
      pairs.push({ csvRow: row, imageFile: null, matchStatus: "unmatched_csv", matchMethod: "none" });
    }
  }

  // Pass 2: brand-name fuzzy match for rows without label_file
  const rowsNeedingFuzzy = csvRows.filter(
    (row) => !row.labelFile && !pairs.find((p) => p.csvRow === row)
  );

  for (const row of rowsNeedingFuzzy) {
    let bestIdx = -1;
    let bestScore = 0;
    imageFiles.forEach((f, i) => {
      if (usedImages.has(i)) return;
      const score = brandFuzzyScore(row.brandName || "", normalizeFilename(f.name));
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });

    if (bestIdx !== -1 && bestScore >= 0.5) {
      usedImages.add(bestIdx);
      pairs.push({ csvRow: row, imageFile: imageFiles[bestIdx], matchStatus: "matched", matchMethod: "brand_fuzzy" });
    } else {
      pairs.push({ csvRow: row, imageFile: null, matchStatus: "unmatched_csv", matchMethod: "none" });
    }
  }

  // Collect images that were never matched
  const unmatchedImages: UnmatchedImage[] = imageFiles
    .filter((_, i) => !usedImages.has(i))
    .map((file) => ({ file, matchStatus: "unmatched_image" as const }));

  return { pairs, unmatchedImages };
}

// ----------------------------------------------------------------
// CSV template generator (batch version with label_file column)
// ----------------------------------------------------------------

export function generateBatchCSVTemplate(): string {
  const header = "label_file,cola_number,brand_name,class_type,alcohol_content,net_contents,name_address,country_of_origin,beverage_type";
  const examples = [
    '01_OLD_TOM_DISTILLERY_bourbon_PASS.png,TTB-2024-0001,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750,"Old Tom Distillery, Bardstown, KY",,distilled_spirits',
    '03_GLENCRAIG_SCOTCH_import_PASS.png,TTB-2024-0002,GLENCRAIG,Blended Scotch Whisky,43,750,"Atlantic Spirits Co., New York, NY",Scotland,distilled_spirits',
    '02_SILVER_RIVER_VODKA_PASS.png,TTB-2024-0003,SILVER RIVER,American Vodka,40,1000,"Silver River Spirits LLC, Austin, TX",,distilled_spirits',
  ];
  return [header, ...examples].join("\r\n");
}

/** Legacy single-verify template (still used by CSVUpload in Verify page) */
export function generateCSVTemplate(): string {
  const header = "brand_name,class_type,alcohol_content,net_contents,name_address,country_of_origin,beverage_type";
  const examples = [
    'OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750,"Old Tom Distillery, Bardstown, KY",,distilled_spirits',
    'GLENCRAIG,Blended Scotch Whisky,43,750,"Atlantic Spirits Co., New York, NY",Scotland,distilled_spirits',
    'SILVER RIVER,American Vodka,40,1000,"Silver River Spirits LLC, Austin, TX",,distilled_spirits',
    'BLUE MESA,London Dry Gin,47,750,"Blue Mesa Distillery, Denver, CO",,distilled_spirits',
  ];
  return [header, ...examples].join("\r\n");
}
