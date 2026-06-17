/**
 * ocr.ts
 *
 * Browser-based OCR using Tesseract.js — runs entirely offline, no cloud API.
 * All worker, WASM core, and language data files are served from /public so
 * the app works behind firewalls with no outbound internet access.
 *
 * The worker fetches eng.traineddata.gz from the same origin (langPath).
 * This is a 2.9MB gzipped file — much smaller than tessdata_best.
 * The worker decompresses it internally before loading into WASM memory.
 */

import { createWorker } from "tesseract.js";

export type OcrProgressCallback = (progress: number, status: string) => void;

let workerInstance: Awaited<ReturnType<typeof createWorker>> | null = null;
let workerReady = false;

/**
 * Resolve the base URL of the deployed app at runtime.
 * Strips the page filename so we get the directory where assets live.
 * Works whether the app is served from / or a subdirectory.
 */
function getPublicBase(): string {
  const href = window.location.href.split("?")[0].split("#")[0];
  return href.substring(0, href.lastIndexOf("/") + 1);
}

/**
 * Initialize the Tesseract worker once and reuse it across calls.
 * The worker fetches eng.traineddata.gz from our public folder (same-origin).
 */
async function getWorker(onProgress?: OcrProgressCallback): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (workerInstance && workerReady) return workerInstance;

  const base = getPublicBase();
  onProgress?.(0, "Loading OCR engine…");

  workerInstance = await createWorker("eng", 1 /* OEM.LSTM_ONLY */, {
    workerPath: `${base}tesseract-worker.min.js`,
    corePath:   base,
    langPath:   base,        // worker fetches: ${base}eng.traineddata.gz
    gzip:       true,        // worker decompresses eng.traineddata.gz internally
    cacheMethod: "none",     // no IndexedDB caching — avoids all storage API issues
    logger: (m: { status: string; progress: number }) => {
      if (onProgress) {
        // Map Tesseract's internal 0–1 progress to 0–60% of our overall scale
        // (the remaining 40% is used during recognize())
        const pct = Math.min(60, Math.round((m.progress || 0) * 60));
        onProgress(pct, m.status.replace(/_/g, " "));
      }
    },
  });

  workerReady = true;
  return workerInstance;
}

/**
 * Run OCR on an uploaded image File and return the extracted text.
 * On first call, initializes the worker (loads WASM + language data).
 * Subsequent calls reuse the same worker — much faster.
 */
export async function recognizeImage(
  imageFile: File,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const worker = await getWorker(onProgress);
  onProgress?.(65, "Reading label text…");

  const url = URL.createObjectURL(imageFile);
  try {
    const { data } = await worker.recognize(url);
    onProgress?.(100, "Done");
    return data.text || "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Terminate the shared worker — call between large batches to free memory.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerReady = false;
  }
}
