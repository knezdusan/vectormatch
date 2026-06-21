# Module A — Web Workers: Theory, Intended Design, and What Actually Shipped

An instructive walkthrough of Web Workers in the context of Module A's PDF
parsing. This guide has an unusual but important shape: the project **planned**
to use a Web Worker, wrote the Web Worker file, and then **abandoned it during
implementation** in favor of a main-thread approach. Understanding *why* that
happened is the most valuable lesson in this document — it teaches you both what
Web Workers are and where they break down in real Next.js 16 projects.

> **Governing decision (VectorMatchTechnicalImplementation.md §3.3):**
> *"The original design called for `pdfjs-dist` to run inside a Web Worker.
> This was revised during implementation due to a fundamental browser
> constraint: browsers do not allow spawning a Worker from inside another
> Worker."*

---

## 1. What a Web Worker Is (the theory)

JavaScript in the browser is **single-threaded**. One main thread runs your
React components, event handlers, animations, layout, and paint. When a
long-running task (PDF parsing, image processing, large sorting) runs on that
main thread, **everything else freezes** — no clicks register, no animations
advance, the page looks janky or "frozen." The browser may even show a "page
unresponsive" dialog.

A **Web Worker** is a way to run JavaScript on a **separate thread** that the
browser spawns for you. The worker thread:

- Runs in its own global scope (`self`, not `window`).
- **Cannot touch the DOM** — no `document`, no `querySelector`, no React. It is
  a pure computation sandbox.
- Communicates with the main thread **only by message passing**:
  `postMessage(data)` in either direction. Data is *copied* (or transferred)
  across the thread boundary, not shared by reference.

The communication model is the whole point. It looks like this:

```
┌───────── MAIN THREAD ─────────┐         ┌──────── WORKER THREAD ────────┐
│                               │         │                               │
│  const worker = new Worker(   │         │                               │
│    new URL('./w.ts',          │  spawn  │  self.onmessage = (e) => {    │
│      import.meta.url),        │ ──────> │    const result = heavyWork(  │
│    { type: 'module' }         │         │      e.data)                  │
│  )                            │         │    self.postMessage(result)   │
│                               │         │  }                            │
│  worker.onmessage = (e) => {  │         │                               │
│    // e.data === result       │ <────── │                               │
│  }                            │  reply  │                               │
│                               │         │                               │
│  worker.postMessage(file)     │ ──────> │                               │
│                               │  input  │                               │
└───────────────────────────────┘         └───────────────────────────────┘
```

Key facts to internalize:

1. **The worker is a separate file** (or a `Blob` URL). The browser loads it as
   its own script context. In a bundler world, you point at it with
   `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
   and the bundler emits it as a separate chunk.
2. **Messages are the only channel.** You cannot call a function in the worker
   from the main thread. You send data, the worker receives data, it sends data
   back. This is asynchronous and serialized.
3. **`postMessage` copies data** by default (using structured clone). For large
   binary data you can use **transferable objects** (`ArrayBuffer`,
   `MessagePort`) to move ownership without copying — but the API is still
   message-based.
4. **Workers are not free.** Spawning a worker has startup cost (parsing the
   script, initializing the context). For tiny tasks, the spawn cost exceeds
   the work. Workers pay off when the work is genuinely heavy (hundreds of
   milliseconds or more) and would otherwise block the main thread.

---

## 2. Why Module A Wanted a Web Worker

Module A's State 1 flow is: **user uploads a PDF → extract its text → send the
text to a Server Action → LLM parses it.** The "extract its text" step uses
`pdfjs-dist`, Mozilla's PDF parser. PDF parsing is genuinely heavy work:

- Decoding compressed streams (FlateDecode, etc.).
- Interpreting the PDF content stream operators.
- Assembling text runs into readable strings, page by page.

For a 5-page CV this can take **200–800ms** depending on the PDF. Run that on
the main thread and the UI is frozen for the better part of a second — the
spinner won't animate, the button won't show its pressed state, the user can't
cancel. That is exactly the scenario Web Workers exist for.

The original design (documented in MODULE_A_IMPLEMENTATION_HANDOFF.md §2) was
textbook:

- **`src/workers/pdf-extract.worker.ts`** — the worker script. Imports
  `pdfjs-dist`, listens for a `File` via `onmessage`, parses it, posts the raw
  text back.
- **`src/lib/onboarding/pdf-worker-client.ts`** — a main-thread wrapper that
  instantiates the worker, sends the file, and returns a `Promise` resolving
  with the result (so the caller can `await` it like a normal async function).

This is the standard, recommended pattern. Let's look at both files as they
actually exist in the repo.

---

## 3. The Intended Design — The Worker File That Exists

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/workers/pdf-extract.worker.ts" />

This file was written exactly per the handoff spec. It is a real, valid Web
Worker. It just isn't the code path that runs in production. Reading it is still
the best way to understand the worker side of the pattern.

### 3.1 The worker scope and the `self` global

```ts
/// <reference lib="webworker" />

import * as pdfjsLib from "pdfjs-dist";
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs";
```

The `/// <reference lib="webworker" />` directive tells TypeScript that this
file's global is the **Worker global scope**, not the DOM scope. That is why
`self.onmessage` and `self.postMessage` are available and `document` is not.
Without this directive, `tsc` would error on worker-only APIs.

### 3.2 The `onmessage` / `postMessage` contract

```ts
type ExtractRequest = { file: File };
type ExtractSuccess = { rawText: string; error: null };
type ExtractFailure = { rawText: null; error: string };

self.onmessage = async (event: MessageEvent<ExtractRequest>) => {
  const { file } = event.data;
  try {
    // ... parse the PDF ...
    self.postMessage({ rawText: fullText.trim(), error: null });
  } catch (error) {
    self.postMessage({
      rawText: null,
      error: error instanceof Error ? error.message : "Unknown PDF extraction error",
    });
  }
};
```

This is the entire worker communication model in miniature:

- **`self.onmessage`** — the handler that fires when the main thread calls
  `worker.postMessage({ file })`. The `event.data` is whatever was sent.
- **`self.postMessage(response)`** — how the worker sends data back. The main
  thread receives it in its `worker.onmessage` handler.
- **Both success and failure go through `postMessage`.** Workers do not throw
  across the thread boundary. If your worker code throws and you don't catch it,
  the main thread sees a `worker.onerror` event (which is harder to handle
  cleanly). The convention is to catch inside the worker and post a
  typed error object back — exactly what this code does.

Note the **discriminated union** response type: `{ rawText: string, error: null }
| { rawText: null, error: string }`. The caller can narrow on `error === null`
to know whether it has text or an error. This is a clean pattern for worker
protocols.

### 3.3 The `pdfjsWorker` workaround (already a warning sign)

Even in the worker file, there is a subtle workaround that foreshadows the
abandonment:

```ts
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs";

const workerModule = pdfjsWorker as unknown as {
  WorkerMessageHandler: unknown;
};
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerModule;
```

This sets `globalThis.pdfjsWorker` to the pdf.js worker module before calling
`getDocument()`. Why? Because **`pdfjs-dist` internally tries to spawn its own
Web Worker** to do the actual PDF parsing (via `GlobalWorkerOptions.workerSrc`).
When you are *already* inside a Web Worker, that nested spawn fails — browsers
do not allow `new Worker()` from within a Worker in most contexts. Setting
`globalThis.pdfjsWorker` tells pdf.js "don't spawn a worker, use this handler
in-thread instead" — the so-called **"fake worker" mode**.

So even the "real Worker" version of this code was already running pdf.js in
fake-worker mode *inside* the worker. The worker thread was just a sandbox for
the fake-worker-mode pdf.js. This is the first sign that the worker is not
buying what we hoped it would.

---

## 4. The Intended Design — The Client Wrapper (as planned)

The handoff doc specified this wrapper (you can see it in
MODULE_A_IMPLEMENTATION_HANDOFF.md §2, lines 162–181):

```ts
export function extractPdfText(file: File): Promise<{ rawText: string; error: string | null }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/pdf-extract.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage({ file });
  });
}
```

This is the canonical "promisify a worker" pattern. Three things to notice:

1. **`new URL('../../workers/pdf-extract.worker.ts', import.meta.url)`** — this
   is how bundlers (Webpack, Turbopack, Vite) know to emit the worker as a
   separate chunk. The `import.meta.url` resolves to the current module's URL,
   and the relative path points at the worker file. The bundler sees this
   `new URL(...)` + `new Worker(...)` combo and treats the target as a worker
   entry point.
2. **`{ type: 'module' }`** — the worker is an ES module (it uses `import`).
   Classic workers use `importScripts()`. Module workers are the modern default
   and are required for `import` syntax to work inside the worker.
3. **`worker.terminate()`** in both callbacks — workers do not garbage-collect
   themselves. You must explicitly terminate them or they leak (the thread and
   its memory persist). The pattern here creates a fresh worker per call and
   tears it down immediately after one use. For a one-shot PDF parse this is
   fine; for repeated work you'd keep the worker alive and reuse it.

The function returns a `Promise` so the caller (`CvUploadForm`) can simply
`await extractPdfText(file)` — the worker machinery is hidden behind a normal
async function signature. This is the right abstraction: the form component
should not know or care that a worker is involved.

---

## 5. What Actually Shipped — and Why

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/pdf-worker-client.ts" />

The active code path does **not** use a Web Worker. It runs `pdfjs-dist` on the
**main thread** in fake-worker mode. Here is the real `extractPdfText`:

```ts
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  // Dynamic import so pdfjs-dist only loads in the browser, not during SSR.
  const pdfjsLib = await import("pdfjs-dist");
  const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");

  const workerModule = pdfjsWorker as unknown as { WorkerMessageHandler: unknown };
  (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerModule;

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
```

Notice what is **gone**: no `new Worker(...)`, no `postMessage`, no
`onmessage`, no `terminate()`. The parsing loop is just inline async code on the
main thread. The `globalThis.pdfjsWorker` trick from §3.3 is still there — but
now it is preventing pdf.js from spawning a worker *from the main thread*,
forcing it to parse in-thread instead.

### 5.1 Why the worker was abandoned — the nested-Worker problem

The technical implementation doc (§3.3) states the reason precisely:

> *"browsers do not allow spawning a Worker from inside another Worker.
> `pdfjs-dist` internally attempts to spawn its own Worker (via
> `GlobalWorkerOptions.workerSrc`) to parse PDFs. When running inside our
> custom Web Worker, this nested spawn fails silently, resulting in
> near-empty text extraction (9 characters instead of thousands)."*

This is the crux. There were **two workers** in the original design:

1. **Our worker** (`pdf-extract.worker.ts`) — the sandbox we spawn to keep the
   main thread free.
2. **pdf.js's internal worker** (`pdf.worker.min.mjs`) — the one pdf.js *itself*
   spawns to do the actual parsing.

The `globalThis.pdfjsWorker` workaround in §3.3 was supposed to neutralize #2
by running pdf.js in fake-worker mode *inside* #1. In practice, this either did
not work reliably or did not work with Next.js 16 + Turbopack's worker bundling
(the handoff doc explicitly flagged this as a "known friction point"). The
symptom was catastrophic: extraction returned ~9 characters instead of
thousands, silently. That is the worst kind of failure — no error, just wrong
data that would have produced garbage LLM output downstream.

The team made the pragmatic call: **run pdf.js on the main thread in
fake-worker mode.** No custom worker at all. pdf.js's own internal worker is
neutralized by the `globalThis.pdfjsWorker` assignment, so everything runs
in-thread on the main thread.

### 5.2 Why this is acceptable — and when it would not be

The trade-off is explicit in the doc:

> *"For typical CV PDFs (1-5 pages), extraction takes <500ms on the main thread,
> which is acceptable for the onboarding MVP."*

The UI impact of a 500ms main-thread block during onboarding is:

- The spinner animation may stutter for half a second.
- The user cannot click anything for half a second.

This happens **once**, during a one-time onboarding step, on a page where the
user has just clicked "Upload and parse CV" and is explicitly waiting. That is
a very different cost from, say, blocking the main thread on every keystroke or
on a frequently-visited dashboard. For an MVP, <500ms of jank on a one-shot
action is a reasonable price for code that actually works.

The doc also names the future escape hatches if this becomes a problem:

> *"If main-thread blocking becomes problematic for very large PDFs, the
> fallback is server-side extraction (a dedicated API route with `pdf-parse`
> or a serverless function), or an OffscreenCanvas-based worker with a
> different PDF library that doesn't internally spawn Workers."*

Note what the escape hatches are **not**: they are not "fix the Web Worker."
The lesson is that the nested-Worker problem is a property of `pdfjs-dist`'s
architecture, not a bug the team could work around. The real options are (a)
accept main-thread execution, (b) move parsing to the server, or (c) use a
different PDF library that does not internally spawn Workers.

### 5.3 The SSR trap — why the import is dynamic

There is one more subtlety in the shipped code that is easy to miss but is
critical for Next.js 16:

```ts
const pdfjsLib = await import("pdfjs-dist");
```

This is a **dynamic `import()` inside the function body**, not a top-level
`import`. The reason, per the doc:

> *"`pdfjs-dist` references browser-only APIs (`DOMMatrix`) at module
> evaluation time. Importing it at the top level of any module that runs
> during SSR causes a `ReferenceError: DOMMatrix is not defined`."*

Next.js App Router server-renders your client components (or at least their
imports) to produce the initial HTML. If `pdfjs-dist` is imported at the top
level of `pdf-worker-client.ts`, and `CvUploadForm.tsx` imports
`extractPdfText` at its top level, then the server tries to evaluate
`pdfjs-dist` — which immediately touches `DOMMatrix` — and crashes.

The dynamic import defers evaluation until `extractPdfText()` is actually
called, which only happens in the browser in a click handler. By that point
`DOMMatrix` exists. This is a general pattern for any browser-only library in
an App Router project: **if it touches `window`/`document`/browser APIs at
module evaluation time, import it dynamically inside the function that uses
it, not at the top of the file.**

---

## 6. How the Form Component Uses It

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/CvUploadForm.tsx" />

The caller does not know or care whether a worker is involved. The contract is
just an async function:

```tsx
const result = await extractPdfText(file);
rawText = result.rawText;
```

This is the real lesson of the abstraction: `extractPdfText` could be
implemented with a Web Worker, on the main thread, or via a `fetch` to a
server-side endpoint, and the form component would not change. The
implementation detail (worker vs. main thread) is bottled up inside one
function. When (or if) the team revisits worker-based or server-side
extraction, only `pdf-worker-client.ts` changes; `CvUploadForm` is untouched.

The form's two-stage submit then becomes:

```
[User clicks "Upload and parse CV"]
        │
        ▼
event.preventDefault()              ← stop native form action
        │
        ▼
setStage("extracting")              ← UI shows "Extracting text…"
        │
        ▼
await extractPdfText(file)          ← MAIN THREAD blocked ~500ms (no worker)
        │
        ▼
setStage("parsing")                 ← UI shows "AI parsing CV…"
        │
        ▼
formData.set("rawText", rawText)
startTransition(() => formAction(formData))   ← Server Action (parseCvAction)
```

The `stage` state machine (`"idle" | "extracting" | "parsing" | "done" |
"error"`) is what gives the user feedback during the two phases. The spinner
text changes from "Extracting text…" to "AI parsing CV…" at the boundary
between client work and server work. This is good UX hygiene regardless of
whether extraction is worker-based or main-thread-based.

---

## 7. The Worker File Today — Reference, Not Runtime

The file <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/workers/pdf-extract.worker.ts" /> still exists in the repo. The technical implementation doc is explicit about its status:

> *"The original Web Worker file is retained for reference but is not the
> active code path."*

This is a deliberate choice. The file is a correct, readable implementation of
the worker pattern — it is useful as documentation of what was tried and as a
starting point if the nested-Worker problem is ever solved (e.g. by switching
to a PDF library that does not internally spawn Workers). Deleting it would
erase that institutional knowledge. Leaving it in `src/workers/` with a clear
header comment explaining it is not active is the right call.

**Practical implication:** do not import `pdf-extract.worker.ts` from any
active code path. If you grep for `new Worker` in the `src/` tree, the only
hits should be inside that file's own header comment. The active extraction
code is `pdf-worker-client.ts` on the main thread.

---

## 8. Summary — What to Take Away

### About Web Workers in general

1. A Web Worker is a **separate thread** for heavy JavaScript computation, with
   **no DOM access** and **message-passing-only** communication (`postMessage`
   / `onmessage`).
2. You spawn one with `new Worker(new URL('./worker.ts', import.meta.url),
   { type: 'module' })`. The bundler emits the worker file as a separate chunk.
3. Workers must be **explicitly terminated** or they leak threads and memory.
4. The standard abstraction is a **promisifying wrapper**: a function that
   creates a worker, sends it a message, wraps `onmessage`/`onerror` in a
   `Promise`, and terminates the worker when done. Callers `await` it like any
   async function.
5. Workers pay off when work is genuinely heavy (hundreds of ms+). For trivial
   work, the spawn cost exceeds the benefit.

### About Module A specifically

1. The **original design** used a Web Worker (`pdf-extract.worker.ts`) to keep
   PDF parsing off the main thread. The worker file exists and is correct.
2. The **active implementation** does **not** use a worker. It runs `pdfjs-dist`
   on the main thread in "fake worker" mode, because `pdfjs-dist` internally
   tries to spawn its own Worker and **browsers forbid nested Workers** —
   causing silent near-empty extraction inside our worker.
3. The workaround (`globalThis.pdfjsWorker = workerModule`) forces pdf.js to
   parse in-thread. This is the same trick the worker file used internally; it
   just now runs on the main thread instead of inside a worker.
4. The cost is a **<500ms main-thread block** during a one-time onboarding
   action. The team judged this acceptable for the MVP. The documented escape
   hatches are server-side extraction or a different PDF library — not
   retrying the worker approach.
5. The **caller (`CvUploadForm`) is insulated** from the implementation choice
   by the `extractPdfText()` abstraction. Swapping the implementation later
   does not require touching the form.
6. The **dynamic `import("pdfjs-dist")`** inside the function is mandatory for
   Next.js 16 SSR compatibility — pdf.js touches `DOMMatrix` at module
   evaluation time, which does not exist on the server.

### The meta-lesson

The most valuable takeaway is not "how to write a Web Worker" — it is that
**third-party library architecture can make the textbook pattern impossible**.
`pdfjs-dist` is designed around its own internal worker. Nesting it inside your
worker creates a constraint the browser refuses to satisfy. No amount of
bundler configuration or `import.meta.url` cleverness fixes that; the fix is
either to accept main-thread execution, move the work to the server, or change
libraries. When a pattern fails, identify *which* constraint is failing
(here: the no-nested-Workers browser rule) before reaching for more tooling.
