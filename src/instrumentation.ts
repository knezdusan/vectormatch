// Next.js Instrumentation — Start in-process scheduler on server startup
// src/instrumentation.ts
//
// D25: Replaced the Inngest auto-sync with the pg-boss scheduler startup.
// The scheduler runs in-process (no external server, no Docker DNS, no
// cached step URIs). It starts automatically on every deploy and survives
// container recreation because the queue state lives in Postgres.
//
// The scheduler is started with a delay to ensure the Next.js server is
// ready and the database connection is available.

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

  // Delay the scheduler start to allow the Next.js server to start
  // accepting requests and the database pool to initialize.
  const START_DELAY_MS = 3000;

  setTimeout(async () => {
    try {
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
