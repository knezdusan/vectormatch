/**
 * Regression test: every exported Inngest function must be registered in the
 * route's `serve({ functions: [...] })` array.
 *
 * Background: The v2 Corpus Expansion implementation (commit 15b3b6b) created
 * `breakerCheck` and `sourceBanRecoveryCheck` in
 * `src/inngest/circuit-breaker-functions.ts` and imported them into the route
 * file, but never added them to the `functions` array passed to `serve()`.
 * Biome flagged the unused import, but the circuit breaker enforcement layer
 * was silently non-functional in production — the functions existed as code
 * and were unit-tested, but the Inngest server never discovered them.
 *
 * This test prevents that class of bug by asserting that EVERY exported
 * `inngest.createFunction` result from the three function source modules is
 * present in the `serve()` functions array.
 */

import { vi } from "vitest";

// --- Mock inngest/next to capture the functions array passed to serve() ---
// serve() is called at module-load time in route.ts, so the mock must be in
// place before the dynamic import. vi.mock is hoisted by Vitest.
let capturedFunctions: unknown[] = [];
vi.mock("inngest/next", () => ({
  serve: (opts: { functions: unknown[] }) => {
    capturedFunctions = opts.functions;
    return { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() };
  },
}));

// Mock the inngest client to avoid initializing a real Inngest client.
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown) => ({ __inngestOpts: opts })),
    createScheduledFunction: vi.fn((opts: unknown) => ({
      __inngestOpts: opts,
    })),
  },
}));

// Re-export the function source modules so we can introspect their exports.
// These are the REAL modules (not mocked) — we need their actual exports to
// compare against the captured functions array.
async function collectExportedFunctions() {
  const [functionsModule, breakerModule, normalizeModule] = await Promise.all([
    import("@/inngest/functions"),
    import("@/inngest/circuit-breaker-functions"),
    import("@/inngest/normalize-provisional-job"),
  ]);
  const modules = [functionsModule, breakerModule, normalizeModule];
  const exported: Record<string, unknown> = {};
  for (const mod of modules) {
    for (const [key, value] of Object.entries(mod)) {
      // Only collect exports that look like Inngest functions (have opts).
      if (
        value !== null &&
        typeof value === "object" &&
        "__inngestOpts" in (value as Record<string, unknown>)
      ) {
        exported[key] = value;
      }
    }
  }
  return exported;
}

describe("Inngest route registration — all exported functions are served", () => {
  beforeAll(async () => {
    // Import the route module AFTER mocks are in place. This triggers the
    // top-level serve() call, which captures the functions array.
    await import("@/app/api/inngest/route");
  });

  it("captured functions array is non-empty", () => {
    expect(capturedFunctions.length).toBeGreaterThan(0);
  });

  it("every exported Inngest function is registered in serve()", async () => {
    const exported = await collectExportedFunctions();
    const exportedNames = Object.keys(exported).sort();
    expect(exportedNames.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [name, fn] of Object.entries(exported)) {
      if (!capturedFunctions.includes(fn)) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      // Provide a clear diagnostic: which functions are exported but not served.
      const servedCount = capturedFunctions.length;
      const exportedCount = exportedNames.length;
      throw new Error(
        `${missing.length} exported Inngest function(s) NOT registered in serve():\n` +
          `  Missing: ${missing.join(", ")}\n` +
          `  Served: ${servedCount} functions, Exported: ${exportedCount} functions`,
      );
    }

    // Sanity: the number of served functions should be >= exported functions.
    // (Could be > if non-function objects are also passed, but in practice ==.)
    expect(capturedFunctions.length).toBeGreaterThanOrEqual(
      exportedNames.length,
    );
  });

  it("v2 circuit breaker functions are registered (regression for 15b3b6b bug)", async () => {
    const exported = await collectExportedFunctions();
    expect(exported).toHaveProperty("breakerCheck");
    expect(exported).toHaveProperty("sourceBanRecoveryCheck");
    expect(capturedFunctions).toContain(exported.breakerCheck);
    expect(capturedFunctions).toContain(exported.sourceBanRecoveryCheck);
  });

  it("v2 provisional lifecycle functions are registered", async () => {
    const exported = await collectExportedFunctions();
    expect(exported).toHaveProperty("normalizeProvisionalJob");
    expect(exported).toHaveProperty("retryInFlightSweeper");
    expect(capturedFunctions).toContain(exported.normalizeProvisionalJob);
    expect(capturedFunctions).toContain(exported.retryInFlightSweeper);
  });

  it("v2 nightly resurrection sweep is registered", async () => {
    const exported = await collectExportedFunctions();
    expect(exported).toHaveProperty("nightlyResurrectionSweep");
    expect(capturedFunctions).toContain(exported.nightlyResurrectionSweep);
  });
});
