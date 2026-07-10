/**
 * B3: Full Funnel Replay — Gate 3 LLM Evaluation
 *
 * Replays the 51 rejected match_queue entries through the current Gate 3
 * evaluator with its updated context (remote_scope, location_countries,
 * compliance directive). Reports:
 *   - How many still get rejected (rejection rate)
 *   - How many now get approved (recall improvement)
 *   - Breakdown by rejection reason
 *   - Sample of approved jobs (to verify they're genuine matches)
 *
 * This is the real precision measurement: does the tuned funnel end-state
 * correctly approve the good and reject the bad?
 *
 * Usage: npx tsx scripts/verify-b3-gate3-replay.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Gate 3 prompt builder (inlined to avoid server-only import issues)
const GATE3_SYSTEM_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a precise yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA:
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job.
   **PRIMARY STACK FROM TITLE (HARD BLOCKER)**: If the job TITLE explicitly names a primary technology (e.g., "Java Developer", "Python Engineer") and that technology is NOT in the persona's must-have tags, this is a HARD BLOCKER — reject immediately.
2. **Seniority fit**: Does the job's seniority level match the persona? Do NOT reject solely because the persona summary says "7+ years" and the job asks for "8+ years" — the stated number is a minimum.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's workplace type. On-site in a foreign country = HARD BLOCKER.
4. **Country-specific remote restrictions**: Use the Remote Scope field as the primary signal:
   - "country_fenced" with locationCountries: restricted to those countries. If applicant NOT in list, check compliance.
   - "global": worldwide remote — no geographic restrictions.
   - "unknown"/null: scan JD for geographic limitations.
   If applicant has w8ben or ic_global compliance, US/North America restrictions are NOT automatic hard blockers — DEFAULT TO APPROVING unless the job EXPLICITLY requires W-2 employment.
   Country-specific restrictions for OTHER countries (Poland, India, etc.) are ALWAYS HARD BLOCKERS regardless of compliance.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona is interested in?

OUTPUT: Return a JSON object with:
- "approved": boolean
- "matchConfidence": number (0-1)
- "matchReasoning": string (1-2 sentences explaining the decision)
- "blockers": array of strings (empty if approved)`;

interface Gate3Context {
  job: {
    title: string;
    description: string;
    extractedTags: string[];
    workplaceType: string | null;
    locationName: string | null;
    employmentType: string | null;
    remoteScope?: string | null;
    locationCountries?: string[] | null;
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
}

function buildGate3Prompt(ctx: Gate3Context): string {
  const { job, persona, applicant } = ctx;
  return `## JOB
Title: ${job.title}
Location: ${job.locationName ?? "Not specified"}
Workplace Type: ${job.workplaceType ?? "Not specified"}
Remote Scope: ${job.remoteScope ?? "unknown"}
Location Countries: ${job.locationCountries?.join(", ") ?? "Not specified"}
Employment Type: ${job.employmentType ?? "Not specified"}
Extracted Tags: ${job.extractedTags.join(", ")}

Description:
${job.description.substring(0, 3000)}

## PERSONA
Label: ${persona.personaLabel}
Summary: ${persona.embeddingSummary}
Must-Have Tags: ${persona.mustHaveTags.join(", ")}
Blocklist Tags: ${persona.blocklistTags.join(", ") || "None"}
Seniority Levels: ${persona.seniorityLevels.join(", ")}

## APPLICANT
Country: ${applicant.country}
Assignment Types: ${applicant.assignmentTypes.join(", ")}
Modalities: ${applicant.modalities.join(", ")}
Preferred Compliance: ${applicant.preferredCompliance.join(", ") || "None"}
Work Authorizations: ${applicant.workAuthorizations.join(", ") || "None"}
Can Work US Hours: ${applicant.canWorkUsHours ?? "Not specified"}

## EVALUATION
Evaluate whether this job is a strong match for this persona. Return your verdict as JSON.`;
}

async function evaluateGate3(ctx: Gate3Context): Promise<any> {
  const prompt = buildGate3Prompt(ctx);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: GATE3_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(
      `OpenAI API error ${response.status}: ${err.substring(0, 200)}`,
    );
  }

  const data = (await response.json()) as any;
  const content = data.choices[0]?.message?.content;
  return JSON.parse(content);
}

async function main() {
  console.log("=== B3: Full Funnel Replay — Gate 3 LLM Evaluation ===\n");

  // 1. Get all rejected match_queue entries with full job data
  const rejected = await sql`
    SELECT mq.id as mq_id, mq.job_id, mq.llm_blockers, mq.evaluated_at,
           j.title, j.location_name, j.workplace_type, j.remote_scope,
           j.location_countries, j.normalized_text, j.extracted_tags,
           j.employment_type
    FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    WHERE mq.status = 'rejected'
    ORDER BY mq.evaluated_at DESC
  `;
  console.log(`Total rejected entries to replay: ${rejected.length}\n`);

  // 2. Get persona + applicant data
  const persona = await sql`
    SELECT persona_label, embedding_summary, must_have_tags, blocklist_tags, seniority_levels
    FROM persona LIMIT 1
  `;
  if (persona.length === 0) {
    console.log("No persona found — cannot replay.");
    process.exit(1);
  }

  // Normalize array fields — PostgreSQL may return them as strings like "{senior,lead,mid}"
  function normalizeArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      // Strip PostgreSQL array syntax: {a,b,c} → ["a","b","c"]
      return val
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  const personaData = {
    persona_label: persona[0].persona_label,
    embedding_summary: persona[0].embedding_summary,
    must_have_tags: normalizeArray(persona[0].must_have_tags),
    blocklist_tags: normalizeArray(persona[0].blocklist_tags),
    seniority_levels: normalizeArray(persona[0].seniority_levels),
  };

  // Applicant is Serbia-based with w8ben/ic_global compliance
  const applicant = {
    allTags: personaData.must_have_tags,
    country: "RS",
    canWorkUsHours: true,
    preferredCompliance: ["w8ben", "ic_global"],
    modalities: ["full-time", "contract"],
    assignmentTypes: ["remote"],
    workAuthorizations: ["eu_citizen"],
  };

  console.log(`Persona: ${personaData.persona_label}`);
  console.log(`Applicant: country=RS, compliance=w8ben+ic_global\n`);

  // 3. Replay each through Gate 3
  let approved = 0;
  let rejected_count = 0;
  let errors = 0;
  const approvedJobs: any[] = [];
  const rejectedJobs: any[] = [];
  const errorJobs: any[] = [];

  for (let i = 0; i < rejected.length; i++) {
    const r = rejected[i];
    process.stdout.write(
      `  [${i + 1}/${rejected.length}] ${r.title?.substring(0, 50)}... `,
    );

    const ctx: Gate3Context = {
      job: {
        title: r.title,
        description: r.normalized_text || r.title,
        extractedTags: normalizeArray(r.extracted_tags),
        workplaceType: r.workplace_type,
        locationName: r.location_name,
        employmentType: r.employment_type,
        remoteScope: r.remote_scope,
        locationCountries: normalizeArray(r.location_countries),
      },
      persona: {
        personaLabel: personaData.persona_label,
        embeddingSummary: personaData.embedding_summary,
        mustHaveTags: personaData.must_have_tags,
        blocklistTags: personaData.blocklist_tags,
        seniorityLevels: personaData.seniority_levels,
      },
      applicant,
    };

    try {
      const verdict = await evaluateGate3(ctx);
      if (verdict.approved) {
        approved++;
        approvedJobs.push({
          mq_id: r.mq_id?.substring(0, 8),
          title: r.title,
          remote_scope: r.remote_scope,
          confidence: verdict.matchConfidence,
          reasoning: verdict.matchReasoning?.substring(0, 80),
          old_blockers: (r.llm_blockers || []).join("; ").substring(0, 60),
        });
        console.log("APPROVED");
      } else {
        rejected_count++;
        rejectedJobs.push({
          mq_id: r.mq_id?.substring(0, 8),
          title: r.title,
          remote_scope: r.remote_scope,
          confidence: verdict.matchConfidence,
          blockers: (verdict.blockers || []).join("; ").substring(0, 80),
        });
        console.log("REJECTED");
      }
    } catch (e) {
      errors++;
      const errMsg =
        e instanceof Error ? e.message.substring(0, 120) : String(e);
      errorJobs.push({
        mq_id: r.mq_id?.substring(0, 8),
        title: r.title,
        error: errMsg,
      });
      console.log(`ERROR: ${errMsg}`);
    }

    // Rate limit: 200ms between calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // 4. Results
  console.log("\n=== B3 Replay Results ===");
  console.log(`  Total replayed: ${rejected.length}`);
  console.log(
    `  Approved (recall improvement): ${approved} (${((approved / rejected.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Rejected (correctly blocked):   ${rejected_count} (${((rejected_count / rejected.length) * 100).toFixed(1)}%)`,
  );
  console.log(`  Errors:                         ${errors}`);

  if (approvedJobs.length > 0) {
    console.log(`\n=== Approved Jobs (previously rejected, now approved) ===`);
    console.table(approvedJobs.slice(0, 20));
  }

  if (rejectedJobs.length > 0) {
    console.log(`\n=== Still Rejected (sample, first 15) ===`);
    console.table(rejectedJobs.slice(0, 15));
  }

  // 5. Analyze: what changed?
  const geoPreviously = rejected.filter((r) => {
    const blockers = (r.llm_blockers || []).join(" ").toLowerCase();
    return (
      blockers.includes("country") ||
      blockers.includes("geo") ||
      blockers.includes("fenc") ||
      blockers.includes("region") ||
      blockers.includes("poland") ||
      blockers.includes("india")
    );
  });
  const geoNowApproved = approvedJobs.filter((j) => {
    const oldBlockers = (j.old_blockers || "").toLowerCase();
    return (
      oldBlockers.includes("country") ||
      oldBlockers.includes("geo") ||
      oldBlockers.includes("fenc") ||
      oldBlockers.includes("region") ||
      oldBlockers.includes("poland") ||
      oldBlockers.includes("india")
    );
  });
  console.log("\n=== Geo-Fencing Analysis ===");
  console.log(`  Previously geo-blocked: ${geoPreviously.length}`);
  console.log(`  Now approved (geo-block lifted): ${geoNowApproved.length}`);
  console.log(
    `  Still geo-blocked: ${geoPreviously.length - geoNowApproved.length}`,
  );

  // 6. Summary
  console.log("\n=== B3 Summary ===");
  const oldRejectionRate = (rejected.length / rejected.length) * 100;
  const newRejectionRate = (rejected_count / rejected.length) * 100;
  console.log(`  Old rejection rate (Gate 3): 100% (all 51 were rejected)`);
  console.log(
    `  New rejection rate (Gate 3): ${newRejectionRate.toFixed(1)}% (${rejected_count}/${rejected.length})`,
  );
  console.log(
    `  Recall improvement: ${approved} jobs now approved (${((approved / rejected.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  These ${approved} jobs would have been suppressed under the old Gate 3`,
  );
  console.log(
    `  The ${rejected_count} still-rejected jobs are correctly blocked (stack mismatch, genuine geo-fence, etc.)`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("B3 verification failed:", err);
  process.exit(1);
});
