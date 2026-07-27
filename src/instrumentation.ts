// Next.js Instrumentation — Start in-process pg-boss scheduler
// src/instrumentation.ts
//
// D27: Inngest fully removed. The pg-boss scheduler is now the sole
// background job system. All 68 Inngest functions have been migrated to
// pg-boss cron jobs and event handlers (see src/scheduler/register.ts).

export async function register(): Promise<void> {
  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Skip in dev mode if the scheduler is disabled
  if (process.env.SCHEDULER_DISABLED === "1") {
    console.info("[instrumentation] Scheduler disabled (SCHEDULER_DISABLED=1)");
    return;
  }

  // Delay the startup to allow the Next.js server to start
  // accepting requests and the database pool to initialize.
  const START_DELAY_MS = 3000;

  setTimeout(async () => {
    // ── Start the pg-boss scheduler ──────────────────────────────────────
    try {
      // D26: Verify pg-boss is installed before attempting to start the
      // scheduler. If pg-boss is missing from the standalone build, the
      // scheduler will silently fail. This check makes the failure loud.
      try {
        await import("pg-boss");
      } catch {
        console.error(
          "[instrumentation] FATAL: pg-boss module not found. The scheduler cannot start.",
          "This usually means the Docker standalone build didn't include pg-boss.",
          "Check that the Dockerfile copies node_modules/pg-boss into the runner stage.",
        );
        return;
      }

      const { scheduler, registerPipelineFunctions } = await import(
        "@/scheduler"
      );

      // Register all pipeline functions before starting
      registerPipelineFunctions();

      // Start the scheduler (creates pg-boss schema if needed, registers
      // cron schedules and event handlers)
      await scheduler.start();

      console.info("[instrumentation] Scheduler started successfully");
    } catch (error) {
      console.error(
        "[instrumentation] Scheduler failed to start:",
        error instanceof Error ? error.message : error,
      );
      // Non-fatal — the app should still start. The scheduler will retry
      // on the next server restart.
    }
  }, START_DELAY_MS);
}
