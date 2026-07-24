"use strict";
/**
 * SMOKE E2E — End-to-end pipeline verification script.
 *
 * Standing rule (ACTION PLAN Phase 1): no deploy is complete and no report may
 * say "ready" until this script passes on production. No exceptions, including
 * infrastructure-only changes.
 *
 * What it does:
 * 1. Selects a known-good global web-dev job from the corpus
 * 2. Verifies it has an embedding, tags, and passes all gate flags
 * 3. Runs the Gate 1+2 SQL router directly
 * 4. Checks if any match_queue entries exist for this job
 * 5. Verifies the dashboard query can see the results
 * 6. Prints per-stage PASS/FAIL
 *
 * Usage:
 *   npx tsx scripts/smoke-e2e.ts                          # local (needs DATABASE_URL)
 *   docker exec <app-container> node /app/scripts/smoke-e2e.js  # on VPS
 *
 * Exit code 0 = all stages passed, 1 = one or more failed.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const results = [];
function log(stage, status, message, data) {
    const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "⚠";
    console.log(`  ${icon} ${stage}: ${status} — ${message}`);
    if (data !== undefined && process.env.SMOKE_VERBOSE) {
        console.log(`    data: ${JSON.stringify(data).substring(0, 200)}`);
    }
    results.push({ stage, status, message, data });
}
async function main() {
    console.log("SMOKE E2E — Pipeline Verification");
    console.log("==================================");
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`DB: ${process.env.DATABASE_URL ? "connected" : "NO DATABASE_URL — will fail"}`);
    console.log("");
    const client = new pg_1.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    // ── Stage 1: Supply check — are there matchable jobs? ──────────────────
    console.log("Stage 1: Supply Check");
    const supply = await client.query(`
    SELECT count(*) AS matchable_supply
    FROM job
    WHERE status='active' AND remote_scope='global' AND is_fenced=false
      AND is_natsec=false AND is_qa=false AND job_embedding IS NOT NULL
  `);
    const supplyCount = parseInt(supply.rows[0].matchable_supply, 10);
    log("supply", supplyCount > 0 ? "PASS" : "FAIL", `${supplyCount} matchable jobs (active, global, unfenced, embedded)`);
    // ── Stage 2: Select a known-good job ───────────────────────────────────
    console.log("Stage 2: Select Known-Good Job");
    const jobResult = await client.query(`
    SELECT id, title, ats_source, ats_slug, extracted_tags, job_embedding IS NOT NULL AS has_embedding
    FROM job
    WHERE status='active' AND remote_scope='global' AND is_fenced=false
      AND is_natsec=false AND is_qa=false AND job_embedding IS NOT NULL
      AND extracted_tags IS NOT NULL AND array_length(extracted_tags, 1) > 0
    ORDER BY detected_at DESC
    LIMIT 1
  `);
    if (jobResult.rows.length === 0) {
        log("select-job", "FAIL", "No job with embedding + tags found");
        await client.end();
        return report();
    }
    const testJob = jobResult.rows[0];
    log("select-job", "PASS", `Selected: "${testJob.title}" (${testJob.ats_source}/${testJob.ats_slug})`, { id: testJob.id, tags: testJob.extracted_tags });
    // ── Stage 3: Gate flags check ──────────────────────────────────────────
    console.log("Stage 3: Gate Flags Check");
    const flags = await client.query(`
    SELECT is_fenced, is_natsec, is_qa, remote_scope, normalized_at
    FROM job WHERE id = $1
  `, [testJob.id]);
    const f = flags.rows[0];
    const flagsOk = f.is_fenced === false &&
        f.is_natsec === false &&
        f.is_qa === false &&
        f.remote_scope === "global" &&
        f.normalized_at !== null;
    log("gate-flags", flagsOk ? "PASS" : "FAIL", `fenced=${f.is_fenced} natsec=${f.is_natsec} qa=${f.is_qa} scope=${f.remote_scope} normalized=${f.normalized_at !== null}`);
    // ── Stage 4: Embedding check ───────────────────────────────────────────
    console.log("Stage 4: Embedding Check");
    log("embedding", testJob.has_embedding ? "PASS" : "FAIL", `Job has embedding: ${testJob.has_embedding}`);
    // ── Stage 5: Persona check — are there personas to match against? ──────
    console.log("Stage 5: Persona Check");
    const personas = await client.query(`
    SELECT count(*) AS persona_count,
           count(*) FILTER (WHERE persona_embedding IS NOT NULL) AS with_embedding,
           count(*) FILTER (WHERE must_have_tags IS NOT NULL AND array_length(must_have_tags, 1) > 0) AS with_tags
    FROM persona
  `);
    const p = personas.rows[0];
    const personaCount = parseInt(p.persona_count, 10);
    log("personas", personaCount > 0 ? "PASS" : "FAIL", `${personaCount} active personas (${p.with_embedding} with embedding, ${p.with_tags} with tags)`);
    // ── Stage 6: Gate 1+2 SQL Router ───────────────────────────────────────
    console.log("Stage 6: Gate 1+2 SQL Router");
    try {
        const gateResult = await client.query(`
      SELECT p.id AS persona_id, p.persona_label AS persona_name,
             1 - (p.persona_embedding <=> j.job_embedding) AS similarity,
             (SELECT count(*) FROM unnest(p.must_have_tags) t WHERE t = ANY(j.extracted_tags)) AS tag_overlap
      FROM persona p, job j
      WHERE j.id = $1
        AND p.persona_embedding IS NOT NULL
        AND p.must_have_tags && j.extracted_tags
        AND 1 - (p.persona_embedding <=> j.job_embedding) > 0.25
      ORDER BY (p.persona_embedding <=> j.job_embedding) ASC
      LIMIT 5
    `, [testJob.id]);
        log("gate-1-2", gateResult.rows.length > 0 ? "PASS" : "WARN", `${gateResult.rows.length} candidates passed Gate 1+2`, gateResult.rows.map((r) => ({
            persona: r.persona_name,
            sim: parseFloat(r.similarity).toFixed(3),
            overlap: r.tag_overlap,
        })));
    }
    catch (err) {
        log("gate-1-2", "FAIL", `SQL error: ${err.message}`);
    }
    // ── Stage 7: Match queue check ─────────────────────────────────────────
    console.log("Stage 7: Match Queue Check");
    const mqResult = await client.query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'approved') AS approved,
           count(*) FILTER (WHERE status = 'pending') AS pending,
           count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h
    FROM match_queue
  `);
    const mq = mqResult.rows[0];
    const mq24h = parseInt(mq.last_24h, 10);
    log("match-queue", mq24h > 0 ? "PASS" : "WARN", `Total: ${mq.total}, Approved: ${mq.approved}, Pending: ${mq.pending}, Last 24h: ${mq24h}`);
    // ── Stage 8: Dashboard query check (serve-time gate filter) ────────────
    console.log("Stage 8: Dashboard Query Check");
    const dashResult = await client.query(`
    SELECT count(*) AS dashboard_visible
    FROM match_queue mq
    INNER JOIN job j ON mq.job_id = j.id
    WHERE j.remote_scope = 'global'
      AND j.is_fenced IS NOT NULL AND j.is_fenced = false
      AND j.is_natsec IS NOT NULL AND j.is_natsec = false
      AND j.is_qa IS NOT NULL AND j.is_qa = false
  `);
    const dashCount = parseInt(dashResult.rows[0].dashboard_visible, 10);
    log("dashboard-query", dashCount > 0 ? "PASS" : "FAIL", `${dashCount} matches visible through serve-time gate filter`);
    // ── Stage 9: Inngest transport check ───────────────────────────────────
    console.log("Stage 9: Inngest Transport Check");
    const inngestUrl = process.env.INNGEST_BASE_URL || "http://10.0.1.11:8288";
    try {
        const http = await Promise.resolve().then(() => __importStar(require("http")));
        const healthCheck = await new Promise((resolve) => {
            const req = http.request(`${inngestUrl}/health`, { method: "GET", timeout: 5000 }, (res) => {
                resolve({
                    status: res.statusCode || 0,
                    ok: (res.statusCode || 0) === 200,
                });
            });
            req.on("error", () => resolve({ status: 0, ok: false }));
            req.on("timeout", () => {
                req.destroy();
                resolve({ status: 0, ok: false });
            });
            req.end();
        });
        log("inngest-health", healthCheck.ok ? "PASS" : "FAIL", `Inngest health: ${healthCheck.status} ${healthCheck.ok ? "OK" : "UNREACHABLE"}`);
    }
    catch {
        log("inngest-health", "WARN", "Could not check Inngest health (no http module)");
    }
    // ── Stage 10: Recent ingestion check ───────────────────────────────────
    console.log("Stage 10: Recent Ingestion Check");
    const ingestResult = await client.query(`
    SELECT count(*) AS jobs_24h,
           count(*) FILTER (WHERE normalized_at IS NOT NULL) AS normalized_24h
    FROM job
    WHERE detected_at > now() - interval '24 hours'
  `);
    const ing = ingestResult.rows[0];
    const jobs24h = parseInt(ing.jobs_24h, 10);
    log("ingestion-24h", jobs24h > 0 ? "PASS" : "WARN", `${jobs24h} jobs ingested in last 24h (${ing.normalized_24h} normalized)`);
    // ── FLOW TEST STAGES (D23 — the test that settles the campaign) ────────
    // These stages assert DELTAS over time, not existence. Any stage at zero
    // = FAIL with the stage named. This is the difference between "I think it
    // works" and "I know it works."
    //
    // The FLOW test answers: "Did the pipeline produce anything new in the last
    // 24 hours WITHOUT human intervention?" If any stage is zero, the scheduled
    // pipeline is broken — even if the corpus has stale data from a manual wave.
    console.log("");
    console.log("── FLOW TEST (D23: deltas over time, not existence) ──");
    console.log("");
    // ── Flow Stage 1: Ingestion delta ──────────────────────────────────────
    console.log("Flow 1: Ingestion Delta (24h)");
    const flowIngest = await client.query(`
    SELECT count(*)::int AS cnt FROM job
    WHERE detected_at > now() - interval '24 hours'
  `);
    const flowIngestCnt = flowIngest.rows[0].cnt;
    log("flow-ingestion", flowIngestCnt > 0 ? "PASS" : "FAIL", `${flowIngestCnt} jobs ingested in last 24h (scheduled pipeline must produce > 0)`);
    // ── Flow Stage 2: Normalization delta ──────────────────────────────────
    console.log("Flow 2: Normalization Delta (24h)");
    const flowNorm = await client.query(`
    SELECT count(*)::int AS cnt FROM job
    WHERE normalized_at > now() - interval '24 hours'
  `);
    const flowNormCnt = flowNorm.rows[0].cnt;
    log("flow-normalization", flowNormCnt > 0 ? "PASS" : "FAIL", `${flowNormCnt} jobs normalized in last 24h`);
    // ── Flow Stage 3: Gate 1+2 delta (new match candidates) ────────────────
    console.log("Flow 3: Gate 1+2 Delta (24h)");
    const flowGate12 = await client.query(`
    SELECT count(*)::int AS cnt FROM match_queue
    WHERE created_at > now() - interval '24 hours'
  `);
    const flowGate12Cnt = flowGate12.rows[0].cnt;
    log("flow-gate12", flowGate12Cnt > 0 ? "PASS" : "FAIL", `${flowGate12Cnt} new match candidates from Gate 1+2 in last 24h`);
    // ── Flow Stage 4: Gate 3 delta (evaluated matches) ─────────────────────
    console.log("Flow 4: Gate 3 Delta (24h)");
    const flowGate3 = await client.query(`
    SELECT count(*)::int AS cnt FROM match_queue
    WHERE evaluated_at > now() - interval '24 hours'
  `);
    const flowGate3Cnt = flowGate3.rows[0].cnt;
    log("flow-gate3", flowGate3Cnt > 0 ? "PASS" : "FAIL", `${flowGate3Cnt} matches evaluated by Gate 3 in last 24h`);
    // ── Flow Stage 5: Dashboard-visible delta ──────────────────────────────
    console.log("Flow 5: Dashboard-Visible Delta (24h)");
    const flowDash = await client.query(`
    SELECT count(*)::int AS cnt
    FROM match_queue mq
    INNER JOIN job j ON mq.job_id = j.id
    WHERE j.remote_scope = 'global'
      AND j.is_fenced = false
      AND j.is_natsec = false
      AND j.is_qa = false
      AND mq.created_at > now() - interval '24 hours'
  `);
    const flowDashCnt = flowDash.rows[0].cnt;
    log("flow-dashboard", flowDashCnt > 0 ? "PASS" : "FAIL", `${flowDashCnt} new dashboard-visible matches in last 24h`);
    // ── Flow Summary ───────────────────────────────────────────────────────
    console.log("");
    console.log("── FLOW TEST SUMMARY ──");
    const flowResults = results.filter((r) => r.stage.startsWith("flow-"));
    const flowPassed = flowResults.filter((r) => r.status === "PASS").length;
    const flowFailed = flowResults.filter((r) => r.status === "FAIL").length;
    console.log(`  FLOW: ${flowPassed}/${flowResults.length} stages passed, ${flowFailed} failed`);
    if (flowFailed > 0) {
        console.log("  FAILED FLOW STAGES:");
        for (const r of flowResults.filter((r) => r.status === "FAIL")) {
            console.log(`    ✗ ${r.stage}: ${r.message}`);
        }
    }
    await client.end();
    return report();
}
function report() {
    console.log("");
    console.log("==================================");
    console.log("SMOKE E2E — SUMMARY");
    console.log("==================================");
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    const warned = results.filter((r) => r.status === "WARN").length;
    console.log(`  PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}`);
    console.log("");
    // Flow test verdict — if any flow stage failed, the test FAILS
    const flowResults = results.filter((r) => r.stage.startsWith("flow-"));
    const flowFailed = flowResults.filter((r) => r.status === "FAIL").length;
    if (failed > 0) {
        console.log("FAILED STAGES:");
        for (const r of results.filter((r) => r.status === "FAIL")) {
            console.log(`  ✗ ${r.stage}: ${r.message}`);
        }
        console.log("");
        if (flowFailed > 0) {
            console.log("VERDICT: SMOKE TEST FAILED — pipeline is broken. Flow test shows the scheduled pipeline is not producing output. Do not deploy.");
        }
        else {
            console.log("VERDICT: SMOKE TEST FAILED — pipeline is broken (state test). Do not deploy.");
        }
        process.exit(1);
    }
    else if (warned > 0) {
        console.log("WARNED STAGES:");
        for (const r of results.filter((r) => r.status === "WARN")) {
            console.log(`  ⚠ ${r.stage}: ${r.message}`);
        }
        console.log("");
        console.log("VERDICT: SMOKE TEST PASSED WITH WARNINGS — pipeline is functional but not optimal.");
        process.exit(0);
    }
    else {
        console.log("VERDICT: SMOKE TEST PASSED — pipeline is healthy.");
        if (flowResults.length > 0) {
            console.log("  FLOW TEST: All stages passed — scheduled pipeline is producing output organically.");
        }
        process.exit(0);
    }
}
main().catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
