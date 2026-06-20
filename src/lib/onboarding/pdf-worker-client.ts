// PDF Worker Client — main-thread wrapper for pdfjs-dist text extraction
// src/lib/onboarding/pdf-worker-client.ts
//
// Extracts raw text from a PDF File using pdfjs-dist. Runs on the main thread
// in "fake worker" mode (same-thread parsing) to avoid the nested-Worker
// problem: browsers don't allow spawning a Worker from inside another Worker.
//
// pdfjs-dist is dynamically imported inside the function so it only loads in
// the browser — importing it at module top level causes SSR to fail because
// pdfjs-dist references browser-only APIs (DOMMatrix) at evaluation time.

export type PdfExtractResult = {
  rawText: string;
  error: string | null;
};

/**
 * Extract raw text from a PDF File using pdfjs-dist in fake-worker mode.
 *
 * Resolves with the raw text on success, or rejects with an Error on failure.
 * Must only be called from a client component (uses browser APIs).
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  // Dynamic import so pdfjs-dist only loads in the browser, not during SSR.
  const pdfjsLib = await import("pdfjs-dist");
  // Import the worker module and register it as globalThis.pdfjsWorker so
  // pdfjs-dist runs in fake-worker (same-thread) mode instead of spawning
  // an internal Worker.
  const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");

  const workerModule = pdfjsWorker as unknown as {
    WorkerMessageHandler: unknown;
  };
  (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker =
    workerModule;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    fullText += `${pageText}\n`;
  }

  return { rawText: fullText.trim(), error: null };
}
