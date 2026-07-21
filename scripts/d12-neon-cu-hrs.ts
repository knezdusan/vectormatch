// Directive 12 — Ledger: Neon CU-hrs reading
// scripts/d12-neon-cu-hrs.ts
//
// Queries the Neon API for compute hours (CU-hrs) usage.
// This is the 3rd request for this data (Directive 8, then twice more).

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error("Missing NEON_API_KEY or NEON_PROJECT_ID");
    process.exit(1);
  }

  console.log("=== NEON CU-HRS READING (Ledger — 3rd request) ===\n");

  // 1. Get project info (includes endpoints, compute sizes)
  const projectRes = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  const project = await projectRes.json();
  console.log("Project:", project.data?.name ?? "unknown");
  console.log("Project ID:", project.data?.id);
  console.log("Platform:", project.data?.platform_id);
  console.log("Region:", project.data?.region_id);
  console.log("PG version:", project.data?.pg_version);
  console.log("Store size (MB):", project.data?.stores?.[0]?.size ?? "n/a");
  console.log();

  // 2. Get endpoints (compute info)
  const endpoints = project.data?.endpoints ?? [];
  console.log(`Endpoints: ${endpoints.length}`);
  for (const ep of endpoints) {
    console.log(
      `  ${ep.id}: type=${ep.type}, host=${ep.host}, current?=${ep.current}`,
    );
    console.log(
      `    pooler_enabled=${ep.pooler_enabled}, autoscaling=${JSON.stringify(ep.compute?.autoscaling_limit)}`,
    );
    console.log(
      `    provisioned_compute_seconds=${ep.compute?.provisioned_compute_seconds ?? "n/a"}`,
    );
    console.log(
      `    active_time_seconds=${ep.compute?.active_time_seconds ?? "n/a"}`,
    );
    console.log(`    cpu_used_sec=${ep.compute?.cpu_used_sec ?? "n/a"}`);
    console.log(`    compute_seconds=${ep.compute?.compute_seconds ?? "n/a"}`);
    console.log(
      `    suspension_seconds=${ep.compute?.suspension_seconds ?? "n/a"}`,
    );
  }
  console.log();

  // 3. Try consumption endpoint (billing/usage data)
  const consumptionRes = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}/consumption`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (consumptionRes.ok) {
    const consumption = await consumptionRes.json();
    console.log("Consumption data:");
    console.log(JSON.stringify(consumption, null, 2));
  } else {
    console.log(
      `Consumption endpoint: ${consumptionRes.status} ${consumptionRes.statusText}`,
    );
    const body = await consumptionRes.text();
    console.log(`  body: ${body.slice(0, 500)}`);
  }
  console.log();

  // 4. Try the project-level consumption/billing
  const billingRes = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}/consumption_history?limit=100`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (billingRes.ok) {
    const billing = await billingRes.json();
    console.log("Consumption history:");
    console.log(JSON.stringify(billing, null, 2).slice(0, 2000));
  } else {
    console.log(
      `Consumption history: ${billingRes.status} ${billingRes.statusText}`,
    );
    const body = await billingRes.text();
    console.log(`  body: ${body.slice(0, 500)}`);
  }
  console.log();

  // 5. Database-level timing data
  console.log("── Database-level compute info ──");
  const uptime =
    await sql`SELECT extract(epoch from (now() - pg_postmaster_start_time())) as uptime_seconds`;
  console.log(
    `Postgres uptime: ${uptime[0].uptime_seconds} seconds (${(Number(uptime[0].uptime_seconds) / 3600).toFixed(1)} hours)`,
  );

  // 6. Plan info from API
  const userRes = await fetch("https://console.neon.tech/api/v2/users/me", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (userRes.ok) {
    const user = await userRes.json();
    console.log("\nUser info:");
    console.log(`  Email: ${user.data?.email ?? "n/a"}`);
    console.log(`  Plan: ${user.data?.plan ?? "n/a"}`);
    console.log(`  Projects limit: ${user.data?.projects_limit ?? "n/a"}`);
    console.log(
      `  Billing: ${JSON.stringify(user.data?.billing ?? "n/a").slice(0, 200)}`,
    );
  }

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
