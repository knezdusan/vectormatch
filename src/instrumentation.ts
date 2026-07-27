// Next.js Instrumentation — Start in-process scheduler + sync Inngest
// src/instrumentation.ts
//
// D25: Replaced the Inngest auto-sync with the pg-boss scheduler startup.
// D26: Re-added the Inngest auto-sync because 65 Inngest functions remain
// active (discovery, maintenance, monitors). Without the sync, Inngest
// caches the OLD container hostname after every Coolify redeploy and
// cannot reach the app — all Inngest functions silently fail.
//
// Both the pg-boss scheduler AND the Inngest sync run on server startup.

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
    // ── 1. Sync Inngest functions (D26: re-added) ────────────────────────
    // The 65 remaining Inngest functions need to be re-registered after
    // every deploy so Inngest knows the new container hostname.
    //
    // The Inngest SDK's sync mechanism: send a PUT request to the APP's own
    // /api/inngest endpoint. The SDK's PUT handler reads the function
    // definitions and pushes them to the Inngest server using the signing key.
    // This is the correct sync mechanism for self-hosted Inngest (not POST to
    // /fn/register, which is a different API).
    try {
      const inngestBaseUrl = process.env.INNGEST_BASE_URL;
      if (inngestBaseUrl && process.env.INNGEST_DEV !== "1") {
        const { hostname } = await import("node:os");
        const appUrl = `http://${hostname()}:3000/api/inngest`;
        // PUT to the app's own endpoint triggers the SDK to register with Inngest
        const response = await fetch(appUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        });
        if (response.ok) {
          console.info(
            `[instrumentation] Inngest sync triggered (app: ${appUrl})`,
          );
        } else {
          console.warn(
            `[instrumentation] Inngest sync failed: HTTP ${response.status}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        "[instrumentation] Inngest sync error (non-fatal):",
        error instanceof Error ? error.message : error,
      );
    }

    // ── 2. Start the pg-boss scheduler ───────────────────────────────────
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
