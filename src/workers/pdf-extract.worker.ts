// PDF Text Extraction Web Worker
// src/workers/pdf-extract.worker.ts
//
// Runs pdfjs-dist inside a Web Worker so the main thread stays responsive
// while parsing large CV PDFs. The main-thread wrapper
// (src/lib/onboarding/pdf-worker-client.ts) instantiates this worker via
// `new Worker(new URL('./pdf-extract.worker.ts', import.meta.url), { type: 'module' })`.
//
// pdfjs-dist normally spawns its own internal Worker to parse PDFs. When we're
// already inside a Web Worker, that nested spawn fails silently (browsers
// disallow nested Workers in most contexts). To work around this, we set
// `globalThis.pdfjsWorker` to the pdf.worker module's WorkerMessageHandler
// before calling getDocument(). pdfjs-dist detects this and runs in "fake
// worker" mode — parsing in the same thread (our worker) instead of spawning
// a nested Worker.

/// <reference lib="webworker" />

import * as pdfjsLib from "pdfjs-dist";
// Import the worker message handler. Setting it on globalThis.pdfjsWorker
// makes pdfjs-dist use it as a same-thread fake worker.
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs";

// TypeScript doesn't ship types for the worker subpath; cast through unknown.
const workerModule = pdfjsWorker as unknown as {
  WorkerMessageHandler: unknown;
};
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerModule;

type ExtractRequest = { file: File };
type ExtractSuccess = { rawText: string; error: null };
type ExtractFailure = { rawText: null; error: string };
type ExtractResponse = ExtractSuccess | ExtractFailure;

self.onmessage = async (event: MessageEvent<ExtractRequest>) => {
  const { file } = event.data;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      // Disable font fetching for text-only extraction; CVs are text-based.
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

    const response: ExtractResponse = { rawText: fullText.trim(), error: null };
    self.postMessage(response);
  } catch (error) {
    const response: ExtractResponse = {
      rawText: null,
      error:
        error instanceof Error ? error.message : "Unknown PDF extraction error",
    };
    self.postMessage(response);
  }
};
