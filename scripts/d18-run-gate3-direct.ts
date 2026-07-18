// D18 — Run Gate 3 evaluation directly for the 56 pending candidates
// Bypasses Inngest entirely. Fetches context from DB, calls evaluateGate3,
// writes verdict back to match_queue.
//
// Usage: npx tsx --env-file=.env scripts/d18-run-gate3-direct.ts

import { openai } from "@ai-sdk/openai";
import { neon } from "@neondatabase/serverless";
import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";

const sql = neon(process.env.DATABASE_URL!);

// Parse PostgreSQL array strings returned by the neon serverless driver
// e.g. "{mid,junior,senior}" → ["mid", "junior", "senior"]
function parsePgArray(val: unknown): string[] {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string") {
    // Remove surrounding braces and split by comma
    const inner = val.replace(/^\{/, "").replace(/\}$/, "");
    if (inner === "") return [];
    return inner.split(",").map((s) => s.trim());
  }
  return [];
}

// Gate 3 verdict schema (copied from gate-3.ts to avoid server-only import)
const gate3VerdictSchema = z.object({
  approved: z
    .boolean()
    .describe("Whether this job is a strong match for this persona"),
  matchConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score 0.0–1.0"),
  matchReasoning: z
    .string()
    .min(1)
    .max(500)
    .describe("1–3 sentence explanation of the verdict"),
  blockers: z.array(z.string()).describe("Hard disqualifiers if rejected"),
  workAuthRiskFlag: z
    .boolean()
    .describe(
      "Set true if JD is silent on work auth but role is hybrid/single-country-remote",
    ),
});

type Gate3Context = {
  job: {
    title: string;
    description: string;
    extractedTags: string[];
    workplaceType: "remote" | "hybrid" | "on-site" | null;
    locationName: string | null;
    employmentType: string | null;
    remoteScope: string | null;
    locationCountries: string[] | null;
  };
  persona: {
    personaLabel: string;
    embeddingSummary: string;
    mustHaveTags: string[];
    blocklistTags: string[];
    seniorityLevels: string[];
  };
  applicant: {
    allTags: string[];
    country: string | null;
    canWorkUsHours: boolean | null;
    preferredCompliance: string[];
    modalities: string[];
    assignmentTypes: string[];
    workAuthorizations: string[];
  };
};

// Build the Gate 3 prompt (simplified version of buildGate3Prompt)
function buildGate3Prompt(ctx: Gate3Context): string {
  const job = ctx.job;
  const persona = ctx.persona;
  const applicant = ctx.applicant;

  return `## JOB POSTING

**Title:** ${job.title}
**Location:** ${job.locationName ?? "Not specified"}
**Workplace Type:** ${job.workplaceType ?? "Not specified"}
**Employment Type:** ${job.employmentType ?? "Not specified"}
**Remote Scope:** ${job.remoteScope ?? "unknown"}
${job.locationCountries ? `**Location Countries:** ${job.locationCountries.join(", ")}` : ""}
**Extracted Tags:** ${job.extractedTags.join(", ")}

**Job Description:**
${job.description.slice(0, 4000)}

---

## PERSONA

**Label:** ${persona.personaLabel}
**Summary:** ${persona.embeddingSummary}
**Must-Have Tags:** ${persona.mustHaveTags.join(", ")}
**Blocklist Tags:** ${persona.blocklistTags.length > 0 ? persona.blocklistTags.join(", ") : "none"}
**Seniority Levels:** ${persona.seniorityLevels.length > 0 ? persona.seniorityLevels.join(", ") : "any"}

---

## APPLICANT

**Country:** ${applicant.country ?? "Not specified"}
**Can Work US Hours:** ${applicant.canWorkUsHours ?? "Not specified"}
**Preferred Compliance:** ${applicant.preferredCompliance.length > 0 ? applicant.preferredCompliance.join(", ") : "none"}
**Modalities:** ${applicant.modalities.length > 0 ? applicant.modalities.join(", ") : "Not specified"}
**Assignment Types:** ${applicant.assignmentTypes.length > 0 ? applicant.assignmentTypes.join(", ") : "Not specified"}
**Work Authorizations:** ${applicant.workAuthorizations.length > 0 ? applicant.workAuthorizations.join(", ") : "none"}
**All Tags:** ${applicant.allTags.length > 0 ? applicant.allTags.join(", ") : "none"}

---

## EVALUATION

Evaluate whether this job is a strong match for this persona. Consider:
1. Tech stack alignment (do the job's required skills match the persona's must-have tags?)
2. Seniority fit
3. Hard constraints (workplace type, location, compliance)
4. Country-specific remote restrictions
5. Blocklist tags
6. Domain relevance

Respond with a JSON object matching the schema.`;
}

const GATE3_SYSTEM_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a precise yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA:
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? Missing tags are a soft signal, not a hard blocker; the description is the source of truth.
2. **Seniority fit**: Does the job's seniority level match the persona? Only reject if the gap is extreme.
3. **Hard constraints (blockers)**: Check workplace type, location, and compliance preferences.
4. **Country-specific remote restrictions**: Remote Scope = "global" means worldwide remote — no geographic restrictions.
5. **Blocklist tags**: If any job tags appear in the persona's blocklist, reject.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in?

Respond with: approved (boolean), matchConfidence (0-1), matchReasoning (1-3 sentences), blockers (array of strings), workAuthRiskFlag (boolean).`;

async function evaluateGate3(ctx: Gate3Context) {
  const messages: ModelMessage[] = [
    { role: "system", content: GATE3_SYSTEM_PROMPT },
    { role: "user", content: buildGate3Prompt(ctx) },
  ];

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: gate3VerdictSchema,
    messages,
  });

  return object;
}

async function main() {
  // Get all pending match_queue entries
  const pending = await sql`
    SELECT mq.id, mq.job_id, mq.persona_id, mq.applicant_id,
           mq.cosine_distance, mq.overlap_score
    FROM match_queue mq
    WHERE mq.status = 'pending'
    ORDER BY mq.cosine_distance ASC
  `;

  console.log(
    `=== Gate 3 Direct Evaluation: ${pending.length} pending candidates ===`,
  );
  console.log();

  let approved = 0;
  let rejected = 0;
  let errors = 0;

  for (const p of pending) {
    // Fetch context: job, persona, applicant
    const jobRows = await sql`
      SELECT title, normalized_text, extracted_tags, workplace_type,
             location_name, employment_type, remote_scope, location_countries,
             ats_source
      FROM job WHERE id = ${p.job_id}::uuid
    `;
    const personaRows = await sql`
      SELECT persona_label, embedding_summary, must_have_tags, blocklist_tags,
             seniority_levels
      FROM persona WHERE id = ${p.persona_id}::uuid
    `;
    const applicantRows = await sql`
      SELECT all_tags, country, can_work_us_hours, preferred_compliance,
             modalities, assignment_types, work_authorizations
      FROM applicant WHERE user_id = ${p.applicant_id}
    `;

    if (
      jobRows.length === 0 ||
      personaRows.length === 0 ||
      applicantRows.length === 0
    ) {
      console.log(`  SKIP: ${p.id} — missing context`);
      errors++;
      continue;
    }

    const j = jobRows[0];
    const pers = personaRows[0];
    const app = applicantRows[0];

    const ctx: Gate3Context = {
      job: {
        title: j.title,
        description: j.normalized_text ?? "",
        extractedTags: parsePgArray(j.extracted_tags),
        workplaceType: j.workplace_type as
          | "remote"
          | "hybrid"
          | "on-site"
          | null,
        locationName: j.location_name,
        employmentType: j.employment_type,
        remoteScope: j.remote_scope,
        locationCountries: parsePgArray(j.location_countries),
      },
      persona: {
        personaLabel: pers.persona_label,
        embeddingSummary: pers.embedding_summary,
        mustHaveTags: parsePgArray(pers.must_have_tags),
        blocklistTags: parsePgArray(pers.blocklist_tags),
        seniorityLevels: parsePgArray(pers.seniority_levels),
      },
      applicant: {
        allTags: parsePgArray(app.all_tags),
        country: app.country,
        canWorkUsHours: app.can_work_us_hours,
        preferredCompliance: parsePgArray(app.preferred_compliance),
        modalities: parsePgArray(app.modalities),
        assignmentTypes: parsePgArray(app.assignment_types),
        workAuthorizations: parsePgArray(app.work_authorizations),
      },
    };

    try {
      const verdict = await evaluateGate3(ctx);
      const verdictString = verdict.approved ? "approved" : "rejected";

      // Write verdict to DB
      await sql`
        UPDATE match_queue
        SET status = ${verdictString},
            llm_verdict = ${verdictString},
            llm_reasoning = ${verdict.matchReasoning},
            llm_confidence = ${verdict.matchConfidence},
            llm_blockers = ${verdict.blockers},
            llm_model = 'gpt-4o-mini',
            work_auth_risk_flag = ${verdict.workAuthRiskFlag ?? false},
            evaluated_at = NOW()
        WHERE id = ${p.id}::uuid
      `;

      if (verdict.approved) {
        approved++;
        console.log(
          `  APPROVED: ${j.title?.slice(0, 45)} | ${pers.persona_label} | conf: ${verdict.matchConfidence.toFixed(2)} | ${verdict.matchReasoning.slice(0, 80)}`,
        );
      } else {
        rejected++;
        console.log(
          `  REJECTED: ${j.title?.slice(0, 45)} | ${pers.persona_label} | ${verdict.blockers.join("; ").slice(0, 80)}`,
        );
      }
    } catch (e) {
      errors++;
      console.error(`  ERROR: ${j.title?.slice(0, 45)} | ${e}`);
    }
  }

  console.log();
  console.log("=== SUMMARY ===");
  console.log(`  Total: ${pending.length}`);
  console.log(`  Approved: ${approved}`);
  console.log(`  Rejected: ${rejected}`);
  console.log(`  Errors: ${errors}`);

  // Verify final state
  const finalMq = await sql`
    SELECT status, count(*) as cnt
    FROM match_queue
    GROUP BY status
  `;
  console.log();
  console.log("=== Match queue final state ===");
  for (const r of finalMq) {
    console.log(`  ${r.status}: ${r.cnt}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
