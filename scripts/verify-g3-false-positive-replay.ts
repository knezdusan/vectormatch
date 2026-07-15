/**
 * G3: False-Positive Replay — User-Rejected Cases Through Current Gate 3
 *
 * The greenlight gate report correctly identified that B3 only tested the
 * recall side (rejected jobs staying rejected). This script tests the
 * PRECISION side: jobs that Gate 3 APPROVED but the user REJECTED.
 *
 * These are the trust-eroding false positives. If the scope fixes and
 * Rule 6 are working, the current Gate 3 should now REJECT most of them.
 *
 * Cases:
 *   - status = 'mismatch' (10) — user explicitly said "not a match"
 *   - status = 'mark_read' (21) — user saw it but didn't apply (weaker signal)
 *
 * For each case, we replay through the current Gate 3 evaluator and check:
 *   - Does it now REJECT? (correct — false positive caught)
 *   - Does it still APPROVE? (incorrect — false positive persists)
 *   - What mechanism caught/missed it? (Gate 0.5 vs scope vs Gate 3 LLM)
 *
 * Usage: npx tsx scripts/verify-g3-false-positive-replay.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

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

function normalizeArray(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    return val
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function evaluateGate3(ctx: any): Promise<any> {
  const prompt = `## JOB
Title: ${ctx.job.title}
Location: ${ctx.job.locationName ?? "Not specified"}
Workplace Type: ${ctx.job.workplaceType ?? "Not specified"}
Remote Scope: ${ctx.job.remoteScope ?? "unknown"}
Location Countries: ${ctx.job.locationCountries?.join(", ") ?? "Not specified"}
Employment Type: ${ctx.job.employmentType ?? "Not specified"}
Extracted Tags: ${ctx.job.extractedTags.join(", ")}

Description:
${ctx.job.description.substring(0, 3000)}

## PERSONA
Label: ${ctx.persona.personaLabel}
Summary: ${ctx.persona.embeddingSummary}
Must-Have Tags: ${ctx.persona.mustHaveTags.join(", ")}
Blocklist Tags: ${ctx.persona.blocklistTags.join(", ") || "None"}
Seniority Levels: ${ctx.persona.seniorityLevels.join(", ")}

## APPLICANT
Country: ${ctx.applicant.country}
Assignment Types: ${ctx.applicant.assignmentTypes.join(", ")}
Modalities: ${ctx.applicant.modalities.join(", ")}
Preferred Compliance: ${ctx.applicant.preferredCompliance.join(", ") || "None"}
Work Authorizations: ${ctx.applicant.workAuthorizations.join(", ") || "None"}
Can Work US Hours: ${ctx.applicant.canWorkUsHours ?? "Not specified"}

## EVALUATION
Evaluate whether this job is a strong match for this persona. Return your verdict as JSON.`;

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
  console.log("=== G3: False-Positive Replay — User-Rejected Cases ===\n");

  // 1. Get all user-rejected cases
  const userRejected = await sql`
    SELECT mq.id as mq_id, mq.status as user_status, mq.llm_verdict as old_verdict,
           mq.llm_blockers as old_blockers, mq.llm_reasoning as old_reasoning,
           j.id as job_id, j.title, j.location_name, j.workplace_type, j.remote_scope,
           j.location_countries, j.normalized_text, j.extracted_tags, j.employment_type
    FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    WHERE mq.status IN ('mismatch', 'mark_read')
    ORDER BY mq.status, mq.evaluated_at DESC
  `;
  console.log(`Total user-rejected cases: ${userRejected.length}`);
  const mismatches = userRejected.filter(
    (r: any) => r.user_status === "mismatch",
  );
  const markRead = userRejected.filter(
    (r: any) => r.user_status === "mark_read",
  );
  console.log(`  mismatch (strong signal): ${mismatches.length}`);
  console.log(`  mark_read (weak signal): ${markRead.length}\n`);

  // 2. Get persona
  const persona = await sql`
    SELECT persona_label, embedding_summary, must_have_tags, blocklist_tags, seniority_levels
    FROM persona LIMIT 1
  `;
  if (persona.length === 0) {
    console.log("No persona found — cannot replay.");
    process.exit(1);
  }

  const personaData = {
    persona_label: persona[0].persona_label,
    embedding_summary: persona[0].embedding_summary,
    must_have_tags: normalizeArray(persona[0].must_have_tags),
    blocklist_tags: normalizeArray(persona[0].blocklist_tags),
    seniority_levels: normalizeArray(persona[0].seniority_levels),
  };

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
  let nowRejected = 0; // False positive caught
  let stillApproved = 0; // False positive persists
  let errors = 0;

  const results: any[] = [];

  for (let i = 0; i < userRejected.length; i++) {
    const r = userRejected[i];
    process.stdout.write(
      `  [${i + 1}/${userRejected.length}] (${r.user_status}) ${r.title?.substring(0, 50)}... `,
    );

    const ctx = {
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
      const nowApproved = verdict.approved;
      const wasApproved = r.old_verdict === "approved";

      let outcome: string;
      if (wasApproved && !nowApproved) {
        outcome = "CAUGHT"; // Was approved, now rejected — false positive fixed
        nowRejected++;
      } else if (wasApproved && nowApproved) {
        outcome = "PERSISTS"; // Was approved, still approved — false positive persists
        stillApproved++;
      } else {
        outcome = "WAS_REJECTED"; // Was already rejected by Gate 3 (not a false positive)
      }

      results.push({
        mq_id: r.mq_id?.substring(0, 8),
        user_status: r.user_status,
        title: r.title,
        location: r.location_name,
        remote_scope: r.remote_scope,
        countries: normalizeArray(r.location_countries).join(","),
        old_verdict: r.old_verdict,
        new_verdict: nowApproved ? "approved" : "rejected",
        outcome,
        new_blockers: (verdict.blockers || []).join("; ").substring(0, 80),
        confidence: verdict.matchConfidence,
      });

      console.log(`${outcome} (confidence: ${verdict.matchConfidence})`);
    } catch (e) {
      errors++;
      const errMsg =
        e instanceof Error ? e.message.substring(0, 80) : String(e);
      results.push({
        mq_id: r.mq_id?.substring(0, 8),
        user_status: r.user_status,
        title: r.title,
        outcome: "ERROR",
        error: errMsg,
      });
      console.log(`ERROR: ${errMsg}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // 4. Results
  console.log("\n=== G3 Replay Results ===");
  console.log(`  Total replayed: ${userRejected.length}`);
  console.log(`  CAUGHT (was approved, now rejected): ${nowRejected}`);
  console.log(`  PERSISTS (was approved, still approved): ${stillApproved}`);
  console.log(
    `  WAS_REJECTED (not a false positive): ${userRejected.length - nowRejected - stillApproved - errors}`,
  );
  console.log(`  Errors: ${errors}`);

  // 5. Detailed results table
  console.log("\n=== All Cases (detailed) ===");
  console.table(
    results.map((r) => ({
      id: r.mq_id,
      status: r.user_status,
      title: r.title?.substring(0, 40),
      location: (r.location || "").substring(0, 20),
      remote_scope: r.remote_scope,
      countries: r.countries,
      old: r.old_verdict,
      new: r.new_verdict || r.outcome,
      outcome: r.outcome,
      blockers: (r.new_blockers || "").substring(0, 50),
    })),
  );

  // 6. Analysis by mechanism
  console.log("\n=== Mechanism Analysis ===");
  const caught = results.filter((r) => r.outcome === "CAUGHT");
  const persists = results.filter((r) => r.outcome === "PERSISTS");

  // What caught the false positives?
  if (caught.length > 0) {
    console.log(`\nCAUGHT cases (${caught.length}) — what blocked them now:`);
    for (const c of caught) {
      console.log(`  ${c.mq_id}: ${c.title?.substring(0, 40)}`);
      console.log(
        `    remote_scope=${c.remote_scope}, countries=${c.countries}`,
      );
      console.log(`    new blockers: ${c.new_blockers}`);
    }
  }

  // What still passes?
  if (persists.length > 0) {
    console.log(
      `\nPERSISTS cases (${persists.length}) — false positives still not caught:`,
    );
    for (const p of persists) {
      console.log(`  ${p.mq_id}: ${p.title?.substring(0, 40)}`);
      console.log(
        `    location=${p.location}, remote_scope=${p.remote_scope}, countries=${p.countries}`,
      );
      console.log(`    confidence: ${p.confidence}`);
    }
  }

  // 7. Summary by user_status
  console.log("\n=== Summary by User Status ===");
  const mismatchResults = results.filter((r) => r.user_status === "mismatch");
  const markReadResults = results.filter((r) => r.user_status === "mark_read");

  const mismatchCaught = mismatchResults.filter(
    (r) => r.outcome === "CAUGHT",
  ).length;
  const mismatchPersists = mismatchResults.filter(
    (r) => r.outcome === "PERSISTS",
  ).length;
  const markReadCaught = markReadResults.filter(
    (r) => r.outcome === "CAUGHT",
  ).length;
  const markReadPersists = markReadResults.filter(
    (r) => r.outcome === "PERSISTS",
  ).length;

  console.log(
    `  mismatch (strong signal): ${mismatchCaught} caught / ${mismatchPersists} persists / ${mismatchResults.length} total`,
  );
  console.log(
    `  mark_read (weak signal):  ${markReadCaught} caught / ${markReadPersists} persists / ${markReadResults.length} total`,
  );

  // 8. Final verdict
  console.log("\n=== G3 Final Verdict ===");
  const totalFalsePositives = nowRejected + stillApproved;
  const catchRate =
    totalFalsePositives > 0 ? (nowRejected / totalFalsePositives) * 100 : 0;
  console.log(
    `  False-positive catch rate: ${catchRate.toFixed(1)}% (${nowRejected}/${totalFalsePositives})`,
  );
  console.log(
    `  ${catchRate >= 80 ? "✓ LARGE MAJORITY caught — precision fix is working" : catchRate >= 50 ? "~ PARTIAL — some false positives still escape" : "✗ INSUFFICIENT — most false positives still escape"}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("G3 verification failed:", err);
  process.exit(1);
});
