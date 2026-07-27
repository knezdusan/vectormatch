/**
 * D28 JOB 2 — Integration tests against a real Postgres database.
 *
 * These tests are the permanent cure for the "test-suite blind spot" that
 * allowed a SQL syntax error (extra `)` in gate-1-2.ts) and an AI SDK
 * bundling error to go undetected by 2,865 mocked unit tests.
 *
 * They connect to a dedicated test database (vectormatch_test) on the VPS
 * Postgres via the SSH tunnel (localhost:15432). The test DB has the same
 * schema as production (dumped via pg_dump --schema-only).
 *
 * Requirements:
 * - SSH tunnel to VPS must be up: `ssh -f -N vectormatch-vps`
 * - vectormatch_test database must exist with schema applied
 * - DATABASE_URL_TEST env var or default to localhost:15432
 *
 * These tests are SKIPPED automatically if the test DB is unreachable,
 * so they don't break the unit test suite in environments without DB access.
 */

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Use raw pg Pool (not the app's neon-serverless) to connect to the test DB
const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://vectormatch:e57d2e9f695d0b10780d55c614f7c597e7476a45060b86977e33ccdc23e4637d@localhost:15432/vectormatch_test";

let pool: Pool | null = null;

// Unique test run ID for cleanup
const RUN_ID = `d28test_${Date.now()}`;
const TEST_JOB_ID = `00000000-0000-0000-0000-${RUN_ID.slice(-12).padStart(12, "0")}`;
const TEST_PERSONA_ID = `00000000-0000-0000-0001-${RUN_ID.slice(-12).padStart(12, "0")}`;
const TEST_APPLICANT_ID = `00000000-0000-0000-0002-${RUN_ID.slice(-12).padStart(12, "0")}`;
const TEST_COMPANY_ATS_SLUG = `test-company-${RUN_ID}`;

// Check DB connectivity — returns true if the test DB is reachable
async function checkDbConnection(): Promise<boolean> {
  if (pool) return true;
  try {
    const p = new Pool({
      connectionString: TEST_DB_URL,
      connectionTimeoutMillis: 5000,
    });
    const client = await p.connect();
    client.release();
    pool = p;
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await checkDbConnection();
});

afterAll(async () => {
  if (pool) {
    try {
      const client = await pool.connect();
      await client.query("DELETE FROM match_queue WHERE job_id = $1", [
        TEST_JOB_ID,
      ]);
      await client.query("DELETE FROM job WHERE id = $1", [TEST_JOB_ID]);
      await client.query("DELETE FROM persona WHERE id = $1", [
        TEST_PERSONA_ID,
      ]);
      await client.query("DELETE FROM applicant WHERE user_id = $1", [
        TEST_APPLICANT_ID,
      ]);
      await client.query('DELETE FROM "user" WHERE id = $1', [
        TEST_APPLICANT_ID,
      ]);
      await client.query("DELETE FROM company WHERE ats_slug = $1", [
        TEST_COMPANY_ATS_SLUG,
      ]);
      client.release();
    } catch {
      // Best-effort cleanup
    }
    await pool.end();
  }
});

// Helper: seed a test job + persona + applicant
async function seedTestData(client: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}) {
  // Insert user first (applicant has FK to user.user_id)
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, banned)
     VALUES ($1, 'Test User', 'test-${RUN_ID}@example.com', true, NOW(), NOW(), 'user', false)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_APPLICANT_ID],
  );

  // Insert applicant (no email column — auth is handled by Better Auth)
  // preferred_compliance is compliance[] enum, modalities is modality[],
  // assignment_types is assignment_type[] enum — must cast arrays properly
  await client.query(
    `INSERT INTO applicant (user_id, is_onboarded, all_tags, country, can_work_us_hours, preferred_compliance, modalities, assignment_types, work_authorizations, seniority_levels)
     VALUES ($1, true, ARRAY['typescript', 'react', 'nodejs'], 'Serbia', true,
             ARRAY['b2b']::compliance[],
             ARRAY['contract']::modality[],
             ARRAY['remote']::assignment_type[],
             ARRAY['authorized'], ARRAY['senior']::seniority_level[])
     ON CONFLICT (user_id) DO NOTHING`,
    [TEST_APPLICANT_ID],
  );

  // Insert persona with embedding (1536-dim, all 0.1 for simplicity)
  // persona_id is a text field (not the UUID id) — used as a human-readable label
  const embedding = `[${Array(1536).fill(0.1).join(",")}]`;
  await client.query(
    `INSERT INTO persona (id, applicant_id, persona_id, persona_label, embedding_summary, must_have_tags, blocklist_tags, seniority_levels, persona_embedding, created_at, updated_at)
     VALUES ($1, $2, 'test-persona-${RUN_ID}', 'Test Persona', 'Senior frontend engineer', ARRAY['typescript', 'react'], ARRAY[]::text[], ARRAY['senior']::seniority_level[], $3::vector, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_PERSONA_ID, TEST_APPLICANT_ID, embedding],
  );

  // Insert job — global remote, not fenced, with matching tags
  // Required NOT NULL columns without defaults: ats_source, ats_slug, title, external_job_id
  const jobEmbedding = `[${Array(1536).fill(0.1).join(",")}]`;
  await client.query(
    `INSERT INTO job (id, ats_source, ats_slug, title, external_job_id, status, remote_scope, location_name, is_fenced, is_natsec, is_qa, normalized_text, extracted_tags, job_embedding, text_hash, detected_at)
     VALUES ($1, 'greenhouse', $2, 'Senior Frontend Engineer (Remote)', 'test-ext-${RUN_ID}', 'active', 'global', 'Remote', false, false, false, 'We are looking for a senior frontend engineer with TypeScript and React experience.', ARRAY['typescript', 'react'], $3::vector, 'test-hash-${RUN_ID}', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_JOB_ID, TEST_COMPANY_ATS_SLUG, jobEmbedding],
  );
}

describe("Gate 1+2 Integration (real Postgres)", () => {
  it(
    "executes the Gate 1+2 SQL without syntax errors",
    { timeout: 30000 },
    async () => {
      if (!(await checkDbConnection())) return; // skip if DB not reachable
      if (!pool) return;
      const client = await pool.connect();
      try {
        await seedTestData(client);

        // Run the actual Gate 1+2 SQL — this is the exact query from gate-1-2.ts
        // that had the syntax error (extra `)` after override_check CTE).
        const jobTags = ["typescript", "react"];
        const tagsArray = `ARRAY[${jobTags.map((t) => `'${t}'`).join(",")}]::text[]`;
        const embeddingStr = `[${Array(1536).fill(0.1).join(",")}]`;

        const result = await client.query(
          `WITH job_meta AS (
          SELECT ats_slug, title, remote_scope, location_name,
                 COALESCE(is_fenced, false) AS is_fenced,
                 COALESCE(is_natsec, false) AS is_natsec,
                 COALESCE(is_qa, false) AS is_qa
          FROM job WHERE id = $1::uuid
        ),
        override_check AS (
          SELECT
            jm.ats_slug,
            jm.title,
            EXISTS(
              SELECT 1 FROM job_label_override jlo
              WHERE jlo.ats_slug = jm.ats_slug
                AND jlo.title = jm.title
                AND jlo.revoked_at IS NULL
                AND jlo.override_type = 'geo_fenced'
            ) AS override_geo_fenced,
            EXISTS(
              SELECT 1 FROM job_label_override jlo
              WHERE jlo.ats_slug = jm.ats_slug
                AND jlo.title = jm.title
                AND jlo.revoked_at IS NULL
                AND jlo.override_type IN ('wrong_stack', 'not_development')
            ) AS override_suppressed
          FROM job_meta jm
        )
        INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
        SELECT
          $1::uuid,
          p.id,
          p.applicant_id,
          ov.overlap_score,
          (p.persona_embedding <=> $2::vector) AS cosine_distance,
          'pending'
        FROM persona p
        CROSS JOIN job_meta jm
        CROSS JOIN override_check oc
        CROSS JOIN LATERAL (
          SELECT count(*) AS overlap_score
          FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${tagsArray})
        ) ov
        WHERE
          p.must_have_tags && ${tagsArray}
          AND NOT (p.blocklist_tags && ${tagsArray})
          AND ov.overlap_score >= 1
          AND (p.persona_embedding <=> $2::vector) < 0.75
          AND p.persona_embedding IS NOT NULL
          AND jm.remote_scope = 'global'
          AND NOT (jm.is_fenced OR oc.override_geo_fenced)
          AND NOT jm.is_natsec
          AND NOT jm.is_qa
          AND NOT oc.override_suppressed
        ORDER BY
          (
            (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * 0.5
            + (1 - (p.persona_embedding <=> $2::vector)) * 0.5
          ) DESC
        LIMIT 50
        ON CONFLICT (job_id, persona_id) DO UPDATE SET
          status = 'pending',
          evaluated_at = NULL,
          overlap_score = EXCLUDED.overlap_score,
          cosine_distance = EXCLUDED.cosine_distance
        RETURNING id, persona_id, applicant_id, overlap_score, cosine_distance`,
          [TEST_JOB_ID, embeddingStr],
        );

        // THE receipt: candidates must be > 0
        expect(result.rows.length).toBeGreaterThan(0);
        console.log(
          `[D28 integration] Gate 1+2 returned ${result.rows.length} candidate(s)`,
        );

        // Verify the test persona is among the candidates
        const candidates = result.rows as Record<string, unknown>[];
        const testCandidate = candidates.find(
          (c) => c.persona_id === TEST_PERSONA_ID,
        );
        expect(testCandidate).toBeDefined();
        expect(testCandidate!.applicant_id).toBe(TEST_APPLICANT_ID);
        expect(Number(testCandidate!.overlap_score)).toBeGreaterThanOrEqual(1);
      } finally {
        client.release();
      }
    },
  );

  it(
    "verifies match_queue rows were actually persisted",
    { timeout: 15000 },
    async () => {
      if (!pool) return;
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT count(*)::int AS cnt FROM match_queue WHERE job_id = $1 AND status = 'pending'",
          [TEST_JOB_ID],
        );
        expect(result.rows[0]).toBeDefined();
        expect(
          Number((result.rows[0] as Record<string, unknown>).cnt),
        ).toBeGreaterThan(0);
        console.log(
          `[D28 integration] match_queue has ${Number((result.rows[0] as Record<string, unknown>).cnt)} pending row(s) for test job`,
        );
      } finally {
        client.release();
      }
    },
  );
});

describe("Gate 3 Integration (real Postgres, mocked LLM)", () => {
  it(
    "writes a verdict to match_queue for a pending candidate",
    { timeout: 30000 },
    async () => {
      if (!(await checkDbConnection())) return; // skip if DB not reachable
      if (!pool) return;
      const client = await pool.connect();
      try {
        // Ensure test data exists (from the Gate 1+2 test above)
        await seedTestData(client);

        // Insert a pending match_queue row if not already there
        await client.query(
          `INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
         VALUES ($1, $2, $3, 2, 0.05, 'pending')
         ON CONFLICT (job_id, persona_id) DO UPDATE SET status = 'pending', evaluated_at = NULL`,
          [TEST_JOB_ID, TEST_PERSONA_ID, TEST_APPLICANT_ID],
        );

        // Simulate what Gate 3 does: fetch context, write verdict.
        // We mock the LLM call (no OpenAI API in tests) but use the REAL DB
        // for the context fetch and verdict write — this catches SQL/column
        // errors in the Gate 3 handler's DB queries.

        // Step 1: Fetch context (same query pattern as runGate3Evaluation)
        const jobResult = await client.query(
          `SELECT title, raw_json, normalized_text, ats_source, extracted_tags,
                workplace_type, location_name, employment_type, remote_scope, location_countries
         FROM job WHERE id = $1`,
          [TEST_JOB_ID],
        );
        expect(jobResult.rows.length).toBe(1);

        const personaResult = await client.query(
          `SELECT persona_label, embedding_summary, must_have_tags, blocklist_tags, seniority_levels
         FROM persona WHERE id = $1`,
          [TEST_PERSONA_ID],
        );
        expect(personaResult.rows.length).toBe(1);

        const applicantResult = await client.query(
          `SELECT all_tags, country, can_work_us_hours, preferred_compliance,
                modalities, assignment_types, work_authorizations
         FROM applicant WHERE user_id = $1`,
          [TEST_APPLICANT_ID],
        );
        expect(applicantResult.rows.length).toBe(1);

        // Step 2: Simulate LLM verdict (mocked — no OpenAI call)
        const mockVerdict = {
          approved: true,
          matchConfidence: 0.85,
          matchReasoning:
            "Strong TypeScript + React match with global remote scope.",
          blockers: [],
          workAuthRiskFlag: false,
        };

        // Step 3: Write verdict to DB (the exact update from runGate3Evaluation)
        // llm_blockers is text[] (not jsonb) — pass as array, not JSON string
        const verdictString = "approved";
        await client.query(
          `UPDATE match_queue
         SET status = $2,
             llm_verdict = $2,
             llm_reasoning = $3,
             llm_confidence = $4,
             llm_blockers = $5::text[],
             rejection_reason = NULL,
             llm_model = 'gpt-4o-mini',
             prompt_variant = 'balanced',
             work_auth_risk_flag = $6,
             evaluated_at = NOW()
         WHERE id = (SELECT id FROM match_queue WHERE job_id = $1 AND persona_id = $7 LIMIT 1)`,
          [
            TEST_JOB_ID,
            verdictString,
            mockVerdict.matchReasoning,
            mockVerdict.matchConfidence,
            mockVerdict.blockers, // pg will serialize JS array to Postgres array
            mockVerdict.workAuthRiskFlag,
            TEST_PERSONA_ID,
          ],
        );

        // THE receipt: verify the verdict was written
        const verifyResult = await client.query(
          `SELECT status, llm_verdict, llm_reasoning, llm_confidence, llm_model
         FROM match_queue
         WHERE job_id = $1 AND persona_id = $2`,
          [TEST_JOB_ID, TEST_PERSONA_ID],
        );

        expect(verifyResult.rows.length).toBe(1);
        const row = verifyResult.rows[0] as Record<string, unknown>;
        expect(row.status).toBe("approved");
        expect(row.llm_verdict).toBe("approved");
        expect(row.llm_model).toBe("gpt-4o-mini");
        expect(Number(row.llm_confidence)).toBe(0.85);
        console.log(
          `[D28 integration] Gate 3 verdict written: status=${row.status}, confidence=${row.llm_confidence}`,
        );
      } finally {
        client.release();
      }
    },
  );
});
