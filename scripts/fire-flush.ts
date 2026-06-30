#!/usr/bin/env tsx
// Flush: Fire all batch source seeders (TDD Item 20 — THE FLUSH)
// scripts/fire-flush.ts
//
// CORPUS_EXPANSION_TDD §2.1 + §8 Item 20 — One-time batch discovery flush.
//
// Sends batch/* events to Inngest, triggering all batch source seeders to
// discover and insert companies. This bootstraps the corpus from ~449 to
// 2,000-5,000 companies in week 1.
//
// B10 (Sitemap Probe) is delayed by 60 seconds because it rescues companies
// where the Slugger failed in other batch sources — it needs the other sources
// to complete first to know which companies failed.
//
// B2 (Google CSE) is skipped — Google CSE API discontinued for new customers
// (Jan 2027 sunset). Revisit with Brave Search API alternative.
// See CORPUS_EXPANSION_HANDOFF.md §"Search API Alternatives".
//
// B8 (Rapid7 FDNS) is skipped — Rapid7 now requires commercial licensing.
// D6 (CertStream) covers the same CNAME-based discovery via CT logs.
//
// B6 (BigQuery) runs on its own monthly cron (0 0 1 * * *) — no flush needed.
//
// Usage:
//   node --conditions react-server --import tsx scripts/fire-flush.ts [options]
//
// Options:
//   --dry-run              Show events that would be sent without sending them
//   --delay-b10            Delay B10 sitemap probe by 60 seconds (default: true)
//   --no-delay-b10         Send B10 immediately with other batch sources
//   --only=B1              Only fire a specific batch source (B1, B2, B3, B4, B5, B7, B9, B10)

import { config } from "dotenv";

// Load .env before importing the inngest client
config();

const BATCH_EVENTS: { name: string; label: string; source: string }[] = [
  {
    name: "batch/workable-meta-search",
    label: "B1",
    source: "Workable Meta-Search",
  },
  { name: "batch/yc-directory", label: "B3", source: "YC Directory" },
  { name: "batch/vc-portfolios", label: "B4", source: "VC Portfolios" },
  {
    name: "batch/newsletter-archives",
    label: "B5",
    source: "Newsletter Archives",
  },
  { name: "batch/wayback-cdx", label: "B7", source: "Wayback CDX" },
  { name: "batch/cross-pollination", label: "B9", source: "Cross-Pollination" },
];

const B10_EVENT = {
  name: "batch/sitemap-probe",
  label: "B10",
  source: "Sitemap Probe",
};

const B10_DELAY_MS = 60_000; // 60 seconds

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const delayB10 = !args.includes("--no-delay-b10");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlyLabel = onlyArg?.split("=")[1]?.toUpperCase();

  // Filter events if --only is specified
  let eventsToSend = BATCH_EVENTS;
  let sendB10 = true;
  if (onlyLabel) {
    eventsToSend = BATCH_EVENTS.filter((e) => e.label === onlyLabel);
    sendB10 = onlyLabel === "B10";
    if (eventsToSend.length === 0 && !sendB10) {
      console.error(`Unknown batch source: ${onlyLabel}`);
      console.error(`Available: B1, B2, B3, B4, B5, B7, B9, B10`);
      process.exit(1);
    }
  }

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  CORPUS EXPANSION — BATCH SOURCE FLUSH (TDD Item 20)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();
  console.log(`Mode:        ${isDryRun ? "DRY RUN (no events sent)" : "LIVE"}`);
  console.log(
    `Inngest:     ${process.env.INNGEST_DEV === "1" ? "Local dev server (localhost:8288)" : "Production"}`,
  );
  console.log(
    `B10 delay:   ${delayB10 ? `${B10_DELAY_MS / 1000}s` : "no delay"}`,
  );
  console.log();

  // Print events to be sent
  console.log("Batch events to fire:");
  for (const e of eventsToSend) {
    console.log(`  ${e.label}: ${e.source} → ${e.name}`);
  }
  if (sendB10) {
    console.log(
      `  ${B10_EVENT.label}: ${B10_EVENT.source} → ${B10_EVENT.name} ${delayB10 ? `(delayed ${B10_DELAY_MS / 1000}s)` : ""}`,
    );
  }
  console.log();
  console.log("Skipped:");
  console.log(
    "  B2: Google CSE (API discontinued — revisit with Brave Search)",
  );
  console.log("  B6: BigQuery (runs on monthly cron)");
  console.log(
    "  B8: Rapid7 FDNS (commercial licensing — D6 CertStream covers this)",
  );
  console.log();

  if (isDryRun) {
    console.log("Dry run complete — no events sent.");
    return;
  }

  // Import the inngest client (after dotenv has loaded .env)
  const { inngest } = await import("@/inngest/client");

  // Send batch events
  console.log("Sending batch events...");
  const events = eventsToSend.map((e) => ({
    name: e.name,
    data: {},
  }));

  if (events.length > 0) {
    await inngest.send(events);
    console.log(`✓ Sent ${events.length} batch events`);
    for (const e of eventsToSend) {
      console.log(`  ${e.label}: ${e.source} — event sent`);
    }
  }

  // Send B10 sitemap probe (delayed or immediate)
  if (sendB10) {
    if (delayB10) {
      console.log();
      console.log(
        `Waiting ${B10_DELAY_MS / 1000}s before sending B10 (Sitemap Probe)...`,
      );
      console.log(
        "(B10 rescues failed Slugger probes from B3/B4/B5 — needs them to complete first)",
      );
      await new Promise((resolve) => setTimeout(resolve, B10_DELAY_MS));
    }

    console.log();
    console.log("Sending B10: Sitemap Probe...");
    await inngest.send({ name: B10_EVENT.name, data: {} });
    console.log(`✓ Sent B10: Sitemap Probe — event sent`);
  }

  console.log();
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  FLUSH COMPLETE — monitor Inngest dashboard for progress");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();
  console.log("Monitor:");
  console.log("  • Inngest dashboard: http://localhost:8288");
  console.log("  • Neon dashboard: check company count increasing");
  console.log("  • Expected duration: 2-6 hours");
  console.log("  • Expected yield: 1,600-4,650 new companies");
}

main().catch((error) => {
  console.error("Flush failed:", error);
  process.exit(1);
});
