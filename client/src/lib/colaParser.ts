/**
 * colaParser.ts
 *
 * Extracts COLA application field values from an uploaded PDF using
 * pdfjs-dist (runs entirely in the browser — no server needed).
 *
 * The parser looks for field labels followed by their values using
 * patterns common in TTB COLA application forms (TTB Form 5100.31).
 */

import * as pdfjsLib from "pdfjs-dist";
import { ApplicationData } from "./labelVerifier";

// Import the worker as a static asset URL (Vite resolves this at build time).
// The ?url suffix tells Vite to return the correct relative URL for the file
// regardless of whether the app is served from a domain root or a subdirectory.
// The worker file lives in client/public/ so it is copied to the build output root.
import workerUrl from "/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ParsedCOLA extends ApplicationData {
  rawText: string;
  confidence: "high" | "medium" | "low";
  fieldsFound: string[];
}

// ── Text extraction ────────────────────────────────────────────────────────────

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items preserving rough layout — separate by newline when y changes significantly
    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of content.items) {
      if ("str" in item) {
        const y = (item as any).transform?.[5] ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine && !currentLine.endsWith(" ") ? " " : "") + item.str;
        }
        lastY = y;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines.join("\n"));
  }

  return pages.join("\n\n");
}

// ── Field extraction patterns ──────────────────────────────────────────────────

function extractAfterLabel(text: string, patterns: RegExp[]): string | undefined {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

function parseCOLAFields(rawText: string): ApplicationData & { fieldsFound: string[] } {
  const t = rawText;
  const fieldsFound: string[] = [];

  // Helper: try patterns, record hit
  const grab = (key: string, patterns: RegExp[]): string | undefined => {
    const val = extractAfterLabel(t, patterns);
    if (val) fieldsFound.push(key);
    return val;
  };

  // Brand Name — TTB form labels vary: "Brand Name", "BRAND NAME:", "Trade Name"
  const brandName = grab("Brand Name", [
    /brand\s*name[:\s]+([^\n\r]{2,60})/i,
    /trade\s*name[:\s]+([^\n\r]{2,60})/i,
    /product\s*name[:\s]+([^\n\r]{2,60})/i,
  ]);

  // Class / Type designation
  const classType = grab("Class / Type", [
    /class[\/\s]+type[:\s]+([^\n\r]{2,80})/i,
    /type\s*(?:of\s*(?:distilled\s*spirit|product|beverage))?[:\s]+([^\n\r]{2,80})/i,
    /designation[:\s]+([^\n\r]{2,80})/i,
    /product\s*type[:\s]+([^\n\r]{2,80})/i,
  ]);

  // Alcohol content
  const alcoholContent = grab("Alcohol Content", [
    /alcohol\s*(?:content|by\s*volume|content\s*by\s*volume)[:\s]+([\d.]+\s*%?\s*(?:alc\.?\/vol\.?|abv)?)/i,
    /alc\.?\s*(?:by\s*)?vol\.?[:\s]+([\d.]+\s*%?)/i,
    /abv[:\s]+([\d.]+\s*%?)/i,
    /([\d]{1,3}\.?\d*)\s*%\s*alc/i,
  ]);

  // Net contents
  const netContents = grab("Net Contents", [
    /net\s*contents?[:\s]+([\d.]+\s*(?:mL|L|ml|l|fl\.?\s*oz\.?|oz))/i,
    /(?:bottle\s*)?size[:\s]+([\d.]+\s*(?:mL|L|ml|l|fl\.?\s*oz\.?))/i,
    /volume[:\s]+([\d.]+\s*(?:mL|L|ml|l))/i,
    /net\s*cont(?:ents?)?[:\s]+([\d.]+)/i,
  ]);

  // Name & Address of bottler/producer
  const nameAddress = grab("Name & Address", [
    /(?:bottled|produced|distilled|imported)\s*by[:\s]+([^\n\r]{5,120})/i,
    /name\s*(?:and|&)\s*address[:\s]+([^\n\r]{5,120})/i,
    /(?:bottler|producer|importer)[:\s]+([^\n\r]{5,120})/i,
  ]);

  // Country of origin
  // Placeholder values used in TTB form templates for domestic products must be
  // treated as blank — do NOT pass them to the verifier as real country values.
  const DOMESTIC_PLACEHOLDERS = [
    /^\(domestic/i,          // "(Domestic — Leave Blank)" and variants
    /^leave\s*blank/i,
    /^n\/?a$/i,              // "N/A" or "NA"
    /^none$/i,
    /^domestic$/i,
    /^united\s*states$/i,
    /^usa?$/i,
  ];
  const rawCountry = extractAfterLabel(t, [
    /country\s*of\s*origin[:\s]+([^\n\r]{2,40})/i,
    /product\s*of[:\s]+([^\n\r]{2,40})/i,
    /imported\s*from[:\s]+([^\n\r]{2,40})/i,
  ]);
  const countryOfOrigin = rawCountry && !DOMESTIC_PLACEHOLDERS.some(p => p.test(rawCountry.trim()))
    ? (fieldsFound.push("Country of Origin"), rawCountry)
    : undefined;

  // Beverage type — infer from class/type or explicit field
  let beverageType: string | undefined;
  const typeHint = (classType || t).toLowerCase();
  if (/whiskey|whisky|bourbon|scotch|rye|brandy|cognac|vodka|gin|rum|tequila|mezcal|distilled spirit/i.test(typeHint)) {
    beverageType = "distilled_spirits";
    if (!fieldsFound.includes("Beverage Type")) fieldsFound.push("Beverage Type (inferred)");
  } else if (/wine|champagne|cider|mead|sake|port|sherry/i.test(typeHint)) {
    beverageType = "wine";
    if (!fieldsFound.includes("Beverage Type")) fieldsFound.push("Beverage Type (inferred)");
  } else if (/beer|ale|lager|stout|porter|malt beverage/i.test(typeHint)) {
    beverageType = "beer";
    if (!fieldsFound.includes("Beverage Type")) fieldsFound.push("Beverage Type (inferred)");
  }

  return {
    brandName,
    classType,
    alcoholContent,
    netContents,
    nameAddress,
    countryOfOrigin,
    beverageType,
    fieldsFound,
  };
}

// ── Confidence scoring ─────────────────────────────────────────────────────────

function scoreConfidence(fieldsFound: string[], totalFields = 6): "high" | "medium" | "low" {
  const core = ["Brand Name", "Class / Type", "Alcohol Content", "Net Contents", "Name & Address"];
  const coreFound = fieldsFound.filter(f => core.some(c => f.startsWith(c))).length;
  if (coreFound >= 4) return "high";
  if (coreFound >= 2) return "medium";
  return "low";
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function parseCOLAPDF(file: File): Promise<ParsedCOLA> {
  const rawText = await extractTextFromPDF(file);
  const { fieldsFound, ...appData } = parseCOLAFields(rawText);
  const confidence = scoreConfidence(fieldsFound);

  return {
    ...appData,
    rawText,
    confidence,
    fieldsFound,
  };
}
