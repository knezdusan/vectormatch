// D17 A3 — Daily Neon Burn Check
// scripts/d17-burn-check.ts
//
// Reads the Neon API for compute_time_seconds and calculates:
// - Current CU-hrs used (compute_time_seconds / 3600)
// - % of free tier (100 CU-hrs/month)
// - Days remaining in consumption period
// - Projected burn at current rate
// - Recommendation: run today's pulse or skip
//
// This script is designed to be run OUTSIDE the batch window (cached API
// read, no DB connection) so it doesn't wake the endpoint.
//
// Usage: npx tsx --env-file=.env scripts/d17-burn-check.ts

const NEON_API_KEY = process.env.NEON_API_KEY ?? "";
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID ?? "cool-grass-94401149";
const FREE_TIER_CU_HRS = 100;

interface NeonProject {
  project: {
    id: string;
    name: string;
    consumption_period_start: string;
    consumption_period_end: string;
    compute_time_seconds: number;
    active_time_seconds: number;
  };
}

async function main() {
  if (!NEON_API_KEY) {
    console.error("NEON_API_KEY not set in .env");
    process.exit(1);
  }

  const response = await fetch(
    `https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}`,
    {
      headers: {
        Authorization: `Bearer ${NEON_API_KEY}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    console.error(
      `Neon API returned ${response.status}: ${await response.text()}`,
    );
    process.exit(1);
  }

  const data: NeonProject = await response.json();
  const p = data.project;

  const cuHrsUsed = p.compute_time_seconds / 3600;
  const pctUsed = (cuHrsUsed / FREE_TIER_CU_HRS) * 100;
  const remaining = FREE_TIER_CU_HRS - cuHrsUsed;

  const periodStart = new Date(p.consumption_period_start);
  const periodEnd = new Date(p.consumption_period_end);
  const now = new Date();
  const daysElapsed =
    (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
  const daysRemaining =
    (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  const burnRate = cuHrsUsed / daysElapsed; // CU-hrs/day
  const projectedTotal = burnRate * (daysElapsed + daysRemaining);
  const projectedRemaining = remaining - burnRate; // after 1 more day

  // Recommendation: if projected remaining after today's pulse < 1 CU-hr, skip
  const dailyPulseCost = 0.5; // estimated CU-hrs for the 2-3 hour daily pulse
  const shouldRunPulse = remaining - dailyPulseCost > 1.0;

  console.log("=== D17 Daily Neon Burn Check ===");
  console.log(`Project: ${p.name} (${p.id})`);
  console.log(
    `Period: ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`,
  );
  console.log(
    `Days elapsed: ${daysElapsed.toFixed(1)} | Days remaining: ${daysRemaining.toFixed(1)}`,
  );
  console.log();
  console.log(
    `Compute time: ${p.compute_time_seconds.toLocaleString()} seconds`,
  );
  console.log(
    `CU-hrs used: ${cuHrsUsed.toFixed(2)} / ${FREE_TIER_CU_HRS} (${pctUsed.toFixed(1)}%)`,
  );
  console.log(`CU-hrs remaining: ${remaining.toFixed(2)}`);
  console.log();
  console.log(`Burn rate: ${burnRate.toFixed(2)} CU-hrs/day`);
  console.log(
    `Projected total at period end: ${projectedTotal.toFixed(2)} CU-hrs`,
  );
  console.log(
    `Projected remaining after 1 more day: ${projectedRemaining.toFixed(2)} CU-hrs`,
  );
  console.log();
  if (shouldRunPulse) {
    console.log(
      `RECOMMENDATION: RUN today's pulse (estimated cost: ${dailyPulseCost} CU-hrs)`,
    );
    console.log(
      `  After pulse: ${(remaining - dailyPulseCost).toFixed(2)} CU-hrs remaining`,
    );
  } else {
    console.log(`RECOMMENDATION: SKIP today's pulse — insufficient runway`);
    console.log(
      `  Running the pulse would leave only ${(remaining - dailyPulseCost).toFixed(2)} CU-hrs`,
    );
    console.log(
      `  A planned pause is not a failure; it's the free tier working as priced.`,
    );
  }

  // Write JSON report
  const report = {
    timestamp: now.toISOString(),
    project: p.name,
    compute_time_seconds: p.compute_time_seconds,
    cu_hrs_used: Number(cuHrsUsed.toFixed(2)),
    cu_hrs_remaining: Number(remaining.toFixed(2)),
    pct_used: Number(pctUsed.toFixed(1)),
    days_elapsed: Number(daysElapsed.toFixed(1)),
    days_remaining: Number(daysRemaining.toFixed(1)),
    burn_rate_per_day: Number(burnRate.toFixed(2)),
    projected_total: Number(projectedTotal.toFixed(2)),
    should_run_pulse: shouldRunPulse,
    daily_pulse_cost: dailyPulseCost,
  };

  console.log();
  console.log("JSON:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
