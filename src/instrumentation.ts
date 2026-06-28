// Next.js Instrumentation — Auto-sync Inngest on server startup
// src/instrumentation.ts
//
// Next.js calls register() once when the server starts. We use this to
// automatically sync function definitions with Inngest Cloud after every
// deploy — no manual `curl -X PUT` needed.
//
// The sync is delayed by a few seconds to ensure the Next.js server is
// ready to accept requests (the /api/inngest endpoint must be available).
// The sync only runs in production (INNGEST_DEV is not set) to avoid
// interfering with the local dev server.
//
// See TDD §3.9.4 (Self-Hosted Deployment) and the Inngest docs for details.

export async function register(): Promise<void> {
  // Only auto-sync in production — the local dev server discovers functions
  // automatically via the Inngest Dev Server.
  if (process.env.INNGEST_DEV === "1") {
    return;
  }

  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Delay the sync to allow the Next.js server to start accepting requests.
  // The /api/inngest endpoint must be available for the PUT request to succeed.
  const SYNC_DELAY_MS = 5000;

  setTimeout(async () => {
    const baseUrl = process.env.INNGEST_SERVE_ORIGIN ?? "http://localhost:3000";
    const syncUrl = `${baseUrl}/api/inngest`;

    try {
      const response = await fetch(syncUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const body = await response.text();
        console.info(
          `[instrumentation] Inngest sync successful: ${response.status}`,
          body.slice(0, 200),
        );
      } else {
        console.warn(
          `[instrumentation] Inngest sync returned ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error) {
      // Non-fatal — Inngest Cloud will also poll the endpoint periodically.
      // This just speeds up the sync after deploy.
      console.warn(
        "[instrumentation] Inngest auto-sync failed (non-fatal — Inngest Cloud will poll):",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, SYNC_DELAY_MS);
}
