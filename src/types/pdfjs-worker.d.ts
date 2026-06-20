declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: {
    initializeFromPort(port: MessagePort): void;
  };
}
