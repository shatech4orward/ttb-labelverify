/**
 * In-memory store for verification jobs and batches.
 * No backend required — all state lives in the browser session.
 *
 * Uses Tesseract.js for real OCR on uploaded label images.
 * Everything runs offline — no cloud API calls.
 */
import { verifyLabel, ApplicationData, VerificationResult } from "./labelVerifier";
import type { MatchedPair, CSVRow } from "./csvParser";
import { recognizeImage, OcrProgressCallback } from "./ocr";

export interface Job {
  id: number;
  originalName: string;
  status: "completed" | "failed";
  beverageType: string;
  overallResult: "pass" | "fail" | "warning";
  score: number;
  fields: VerificationResult["fields"];
  issues: string[];
  warnings: string[];
  agentNotes: string;
  overrideResult: string | null;
  createdAt: number;
  batchId?: string;
  colaNumber?: string;
  ocrText?: string;  // raw OCR output stored for agent review
}

export interface BatchRecord {
  id: string;
  name: string;
  totalCount: number;
  passCount: number;
  failCount: number;
  warningCount: number;
  createdAt: number;
}

let jobIdCounter = 1;

/**
 * Normalize user-entered application data so the label verifier's regex patterns
 * can always match. Handles bare numbers like "45" → "45% Alc./Vol." and
 * "750" → "750 mL", and strips extraneous whitespace.
 */
export function normalizeApplicationData(appData: ApplicationData): ApplicationData {
  const norm = { ...appData };

  // Alcohol content: bare number → "NN% Alc./Vol."
  if (norm.alcoholContent) {
    const bare = norm.alcoholContent.trim();
    if (/^\d{1,3}(\.\d{1,2})?$/.test(bare)) {
      norm.alcoholContent = `${bare}% Alc./Vol.`;
    } else if (/^\d{1,3}(\.\d{1,2})?%$/.test(bare)) {
      norm.alcoholContent = `${bare} Alc./Vol.`;
    }
  }

  // Net contents: bare number → "NNN mL" (assume mL <1000, L for 1–9.9)
  if (norm.netContents) {
    const bare = norm.netContents.trim();
    if (/^\d+(\.\d+)?$/.test(bare)) {
      const num = parseFloat(bare);
      norm.netContents = (num >= 1 && num < 10) ? `${bare} L` : `${bare} mL`;
    }
  }

  return norm;
}

// Singleton in-memory store — persists within the browser session
class Store {
  jobs: Job[] = [];
  batches: BatchRecord[] = [];

  /**
   * Single label verify — runs real OCR on the uploaded image, then compares
   * the extracted text against the provided application data.
   */
  async runVerification(
    file: File,
    appData: ApplicationData,
    onProgress?: OcrProgressCallback
  ): Promise<Job> {
    const normalizedApp = normalizeApplicationData(appData);

    // Run real OCR on the label image
    let ocrText = "";
    try {
      ocrText = await recognizeImage(file, onProgress);
    } catch (err) {
      console.error("OCR failed:", err);
      // Fall back to empty string — verifier will flag all fields as not found
      ocrText = "";
    }

    const result = verifyLabel(ocrText, normalizedApp);

    const job: Job = {
      id: jobIdCounter++,
      originalName: file.name,
      status: "completed",
      beverageType: result.beverageType,
      overallResult: result.overallResult,
      score: result.score,
      fields: result.fields,
      issues: result.issues,
      warnings: result.warnings,
      agentNotes: "",
      overrideResult: null,
      createdAt: Date.now(),
      ocrText,
    };

    this.jobs.unshift(job);
    return job;
  }

  /**
   * Run batch verification on pre-matched CSV/image pairs (4-step batch flow).
   * Each pair has its own ApplicationData from the CSV row.
   * Processes images sequentially (Tesseract worker is single-threaded).
   */
  async runBatchPairs(
    pairs: MatchedPair[],
    batchName: string,
    onItemProgress?: (index: number, total: number, fileName: string, ocrProgress: number, status: string) => void
  ): Promise<BatchRecord> {
    const batchId = `batch-${Date.now()}`;
    let pass = 0, fail = 0, warning = 0;
    const matched = pairs.filter(p => p.imageFile !== null);

    for (let i = 0; i < matched.length; i++) {
      const pair = matched[i];
      if (!pair.imageFile) continue;

      const appData = normalizeApplicationData(pair.csvRow);

      // OCR progress for this image
      const ocrCb: OcrProgressCallback = (pct, status) => {
        onItemProgress?.(i, matched.length, pair.imageFile!.name, pct, status);
      };

      let ocrText = "";
      try {
        ocrText = await recognizeImage(pair.imageFile, ocrCb);
      } catch (err) {
        console.error(`OCR failed for ${pair.imageFile.name}:`, err);
      }

      const result = verifyLabel(ocrText, appData);

      const job: Job = {
        id: jobIdCounter++,
        originalName: pair.imageFile.name,
        colaNumber: pair.csvRow.colaNumber,
        status: "completed",
        beverageType: result.beverageType,
        overallResult: result.overallResult,
        score: result.score,
        fields: result.fields,
        issues: result.issues,
        warnings: result.warnings,
        agentNotes: "",
        overrideResult: null,
        createdAt: Date.now(),
        batchId,
        ocrText,
      };

      this.jobs.unshift(job);
      if (result.overallResult === "pass") pass++;
      else if (result.overallResult === "fail") fail++;
      else warning++;
    }

    const batch: BatchRecord = {
      id: batchId,
      name: batchName || `Batch ${new Date().toLocaleDateString()} (${matched.length} labels)`,
      totalCount: matched.length,
      passCount: pass,
      failCount: fail,
      warningCount: warning,
      createdAt: Date.now(),
    };

    this.batches.unshift(batch);
    return batch;
  }

  getJob(id: number): Job | undefined {
    return this.jobs.find(j => j.id === id);
  }

  deleteJob(id: number) {
    this.jobs = this.jobs.filter(j => j.id !== id);
  }

  updateJob(id: number, updates: Partial<Pick<Job, "agentNotes" | "overrideResult">>) {
    const job = this.jobs.find(j => j.id === id);
    if (job) Object.assign(job, updates);
    return job;
  }

  getStats() {
    const completed = this.jobs.filter(j => j.status === "completed");
    return {
      total: completed.length,
      pass: completed.filter(j => (j.overrideResult || j.overallResult) === "pass").length,
      fail: completed.filter(j => (j.overrideResult || j.overallResult) === "fail").length,
      warning: completed.filter(j => (j.overrideResult || j.overallResult) === "warning").length,
      avgScore: completed.length > 0
        ? Math.round(completed.reduce((s, j) => s + j.score, 0) / completed.length)
        : 0,
    };
  }
}

export const store = new Store();
