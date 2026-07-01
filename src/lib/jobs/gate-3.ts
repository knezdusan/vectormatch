// Module C — Gate 3 LLM Arbiter (Step 6 of the 3-Gate Funnel)
// src/lib/jobs/gate-3.ts
//
// Gate 3 is the final precision filter. Gates 1+2 already narrowed the
// candidate pool to ~8 personas with tag overlap and vector similarity.
// Gate 3 asks gpt-4o-mini to make a nuanced yes/no decision using the full
// context: job description, persona summary, and applicant hard constraints
// (compliance, modality, assignment type, location).
//
// The LLM evaluates:
//   - Does the job's seniority, tech stack, and domain match the persona?
//   - Are there hard blockers? (on-site when applicant wants remote, web3 on
//     blocklist, wrong compliance model, etc.)
//   - Is this a *strong* match, not just a plausible one?
//
// Output: { approved, matchConfidence, matchReasoning, blockers }
// Verdict mapping: approved → 'approved' | !approved → 'rejected' | error → 'error'
//
// Server-only: touches the OpenAI API. The LLM call is wrapped in step.ai.wrap
// by the Inngest handler (§6.2), not here — this module is the pure logic.
// (MODULE_C_DECISIONS.md §6)

import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";

// =============================================================================
// GATE 3 OUTPUT SCHEMA (§6.3)
// =============================================================================

export const gate3VerdictSchema = z.object({
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
  blockers: z
    .array(z.string())
    .describe(
      "Hard disqualifiers if rejected (e.g., 'web3 on blocklist', 'requires on-site in SF')",
    ),
});

export type Gate3Verdict = z.infer<typeof gate3VerdictSchema>;

// =============================================================================
// GATE 3 INPUT TYPES
// =============================================================================

/** The context needed for Gate 3 evaluation. Fetched from DB in step 1. */
export type Gate3Context = {
  job: {
    title: string;
    description: string; // cleaned (HTML stripped)
    extractedTags: string[];
    // Structured metadata — passed to the LLM so it doesn't have to guess
    // from the description text. NULL when the ATS doesn't provide it.
    workplaceType: "remote" | "hybrid" | "on-site" | null;
    locationName: string | null;
    employmentType: string | null;
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
  };
};

// =============================================================================
// GATE 3 SYSTEM PROMPT
// =============================================================================

const GATE3_SYSTEM_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a precise yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA:
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job (even if both are "frontend"). NOTE: Extracted tags are produced by an automated normalizer and may be incomplete — always check the job description for skills that may not appear in the extracted tags. Missing tags are a soft signal, not a hard blocker; the description is the source of truth.
2. **Seniority fit**: Does the job's seniority level match the persona? Read the years of experience from the persona's self-description carefully. Do NOT reject solely because the persona summary says "5+ years" or "7+ years" and the job asks for "8+ years" — the stated number is a minimum in the persona summary, not a maximum. A persona with "7+ years" can qualify for a role asking 8+ years. Only reject on seniority if the gap is extreme (e.g., junior persona vs. principal/staff role requiring 12+ years). If the persona has specified preferred seniority levels, only reject if the job's inferred seniority is NOT among the persona's selected levels. If the persona's seniority levels are empty or "any", do not reject on seniority.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. If the job's Workplace Type is "on-site" and the applicant's assignment types do not include "on-site" or "hybrid", that's a hard blocker. If the job's Workplace Type is "hybrid" and the applicant's assignment types do not include "hybrid", treat this as a SOFT concern, NOT a hard blocker — many hybrid roles offer remote options for the right candidate, especially for senior contractors. Note this in the reasoning but do NOT reject solely on this basis. If Workplace Type is null, infer from the location and description but do not assume remote — check carefully. Also check modalities and compliance preferences.
4. **Country-specific remote restrictions**: Many remote jobs restrict applications to specific countries or regions. Carefully scan the job description for phrases like "remote (US only)", "must be located in [country/region]", "must reside in [country]", "remote within [region]", or similar geographic limitations. If the applicant's Country does not match the job's remote geographic restriction, consider the applicant's compliance preferences:
   - If the applicant's preferred compliance includes "w8ben" or "ic_global", do NOT reject solely because the job says "US only" or "must be located in the US" — many companies hire international contractors via W-8BEN or EOR (Employer of Record) arrangements even when their job posting says "US only". Instead, note the geographic restriction as a SOFT concern in the reasoning and approve if the tech stack and seniority align well. The user can filter by location in their dashboard.
   - If the applicant does NOT have w8ben or ic_global compliance, and the job explicitly restricts to a country/region that does not include the applicant's country, this is a HARD BLOCKER.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in? A React developer persona should match a SaaS frontend job, not a React Native game dev job (unless the persona explicitly mentions mobile).

OUTPUT RULES:
- Be balanced: approve if the tech stack and seniority align well, even if there are soft concerns (location, compliance, hybrid workplace). Only reject for HARD blockers (completely wrong tech stack, on-site when applicant is remote-only with no hybrid flexibility, blocklist tags). Soft concerns should be noted in the reasoning but should NOT cause rejection.
- If rejected, list ALL blockers in the blockers array.
- matchReasoning should be 1–3 sentences explaining the key factor(s) in your decision.
- matchConfidence reflects your certainty, not the match quality. A confident "no" can have high confidence.`;

// =============================================================================
// PROMPT BUILDER (§6.3)
// =============================================================================

/**
 * Build the user prompt for Gate 3 evaluation. Assembles the full context:
 * job, persona, and applicant hard constraints.
 *
 * The prompt is structured as clearly-labeled sections so the LLM can
 * reason about each independently.
 */
export function buildGate3Prompt(ctx: Gate3Context): string {
  const { job, persona, applicant } = ctx;

  return `## JOB POSTING
Title: ${job.title}
Workplace Type: ${job.workplaceType ?? "not specified"}
Location: ${job.locationName ?? "not specified"}
Employment Type: ${job.employmentType ?? "not specified"}
Required Skills: ${job.extractedTags.join(", ") || "none specified"}
Description:
${job.description}

## DEVELOPER PERSONA
Label: ${persona.personaLabel}
Self-Description: ${persona.embeddingSummary}
Must-Have Tags: ${persona.mustHaveTags.join(", ") || "none"}
Blocklist Tags: ${persona.blocklistTags.join(", ") || "none"}
Preferred Seniority Levels: ${persona.seniorityLevels.join(", ") || "any"}

## APPLICANT HARD CONSTRAINTS
Country: ${applicant.country ?? "not specified"}
Can Work US Hours: ${applicant.canWorkUsHours ?? "not specified"}
Preferred Compliance: ${applicant.preferredCompliance.join(", ") || "any"}
Preferred Modalities: ${applicant.modalities.join(", ") || "any"}
Assignment Types: ${applicant.assignmentTypes.join(", ") || "any"}
Full Skill Knowledge Base: ${applicant.allTags.join(", ") || "none"}

## EVALUATION
Based on the above, is this job a strong match for this persona? Consider tech stack alignment, seniority fit, hard constraints (especially workplace type vs assignment types and country-specific remote restrictions), and blocklist tags.`;
}

// =============================================================================
// A/B TEST PROMPT VARIANTS (P6)
// =============================================================================
// Three prompt variants for A/B testing Gate 3 approval rates:
//   - "balanced" (control): the default prompt, balanced between precision and recall
//   - "strict": more conservative, higher precision, lower recall
//   - "thorough": more detailed reasoning, may catch nuances the balanced prompt misses
//
// The variant is randomly assigned per candidate and stored in matchQueue.promptVariant.
// After enough data is collected, analyze approval rates per variant:
//   SELECT prompt_variant, COUNT(*) FILTER (WHERE status='approved') AS approved,
//          COUNT(*) AS total,
//          ROUND(COUNT(*) FILTER (WHERE status='approved')::numeric / COUNT(*) * 100, 1) AS approval_pct
//   FROM match_queue WHERE prompt_variant IS NOT NULL GROUP BY prompt_variant;

const GATE3_STRICT_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a PRECISE yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA (be strict — only approve if you are highly confident):
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job. Extracted tags may be incomplete — always check the job description. If the job's core required skills do not include at least 2 of the persona's must-have tags, reject.
2. **Seniority fit**: Does the job's seniority level match the persona? If the persona has specified preferred seniority levels, reject if the job's inferred seniority is NOT among the selected levels. Do NOT approve a senior persona for a junior role or vice versa. If the persona's seniority levels are empty or "any", do not reject on seniority.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. On-site job + no on-site/hybrid assignment = hard blocker. Hybrid job + no hybrid assignment = soft concern (not a hard blocker — many hybrid roles offer remote options). If Workplace Type is null, infer from the location and description carefully.
4. **Country-specific remote restrictions**: Scan the job description for geographic limitations like "remote (US only)", "must be located in [country]", "must reside in [country]". If the applicant's Country doesn't match AND the applicant does NOT have w8ben or ic_global compliance, this is a HARD BLOCKER. If the applicant HAS w8ben or ic_global compliance, treat geographic restrictions as a SOFT concern — many companies hire international contractors via W-8BEN/EOR even when the posting says "US only".
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in?

OUTPUT RULES:
- Be STRICT but fair: only reject for genuine hard blockers (wrong tech stack, on-site mismatch without hybrid flexibility, blocklist tags, geographic restrictions without contractor compliance). Soft concerns (hybrid workplace, geographic restrictions with w8ben compliance) should be noted but should NOT cause rejection.
- If rejected, list ALL blockers in the blockers array.
- matchReasoning should be 1–3 sentences explaining the key factor(s) in your decision.
- matchConfidence reflects your certainty, not the match quality.`;

const GATE3_THOROUGH_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a careful yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA (reason step by step before deciding):
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job. NOTE: Extracted tags are produced by an automated normalizer and may be incomplete — always check the job description for skills that may not appear in the extracted tags. Consider both the must-have tags AND the applicant's full skill knowledge base — if the job requires a skill the applicant knows but it's not in the must-have tags, that's still a positive signal.
2. **Seniority fit**: Does the job's seniority level match the persona? Read the years of experience from the persona's self-description carefully. Do NOT reject solely because the persona summary says "5+ years" and the job asks for "8+ years" — the stated number is a minimum. If the persona has specified preferred seniority levels, only reject if the job's inferred seniority is NOT among the selected levels. If the persona's seniority levels are empty or "any", do not reject on seniority.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. If the job's Workplace Type is "on-site" and the applicant's assignment types do not include "on-site" or "hybrid", that's a hard blocker. If the job's Workplace Type is "hybrid" and the applicant's assignment types do not include "hybrid", treat this as a SOFT concern — many hybrid roles offer remote options for senior contractors. Note it in reasoning but do NOT reject solely on this basis. If Workplace Type is null, infer from the location and description but do not assume remote — check carefully. Also check modalities and compliance preferences.
4. **Country-specific remote restrictions**: Many remote jobs restrict applications to specific countries or regions. Carefully scan the job description for phrases like "remote (US only)", "must be located in [country/region]", "must reside in [country]", "remote within [region]", or similar geographic limitations. If the applicant's Country does not match, check the applicant's compliance preferences:
   - If the applicant has "w8ben" or "ic_global" compliance, treat the geographic restriction as a SOFT concern — many companies hire international contractors via W-8BEN or EOR even when the posting says "US only". Approve if the tech stack and seniority align.
   - If the applicant does NOT have w8ben or ic_global compliance, and the restriction excludes the applicant's country, this is a HARD BLOCKER.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in? Consider transferable skills — a React developer can plausibly work in most SaaS/web product domains.

OUTPUT RULES:
- Be thorough: consider all criteria before deciding. A match doesn't require perfection — it requires plausibility. If the core tech stack aligns and there are no hard blockers, lean toward approving. Soft concerns (hybrid workplace, geographic restrictions with w8ben compliance) should be noted but should NOT cause rejection.
- If rejected, list ALL blockers in the blockers array.
- matchReasoning should be 1–3 sentences explaining the key factor(s) in your decision.
- matchConfidence reflects your certainty, not the match quality.`;

export type Gate3PromptVariant = "balanced" | "strict" | "thorough";

const PROMPT_VARIANTS: Gate3PromptVariant[] = [
  "balanced",
  "strict",
  "thorough",
];

const VARIANT_PROMPTS: Record<Gate3PromptVariant, string> = {
  balanced: GATE3_SYSTEM_PROMPT,
  strict: GATE3_STRICT_PROMPT,
  thorough: GATE3_THOROUGH_PROMPT,
};

/**
 * Randomly assign a prompt variant for A/B testing.
 * Uses a simple uniform distribution across the 3 variants.
 */
export function pickPromptVariant(): Gate3PromptVariant {
  const idx = Math.floor(Math.random() * PROMPT_VARIANTS.length);
  return PROMPT_VARIANTS[idx];
}

// =============================================================================
// LLM EVALUATION (§6.2)
// =============================================================================

/**
 * Evaluate a Gate 3 candidate using gpt-4o-mini.
 *
 * This is the pure logic — the Inngest handler wraps this in step.ai.wrap
 * for observability. Can also be called directly from tests (with a mocked
 * generateObject).
 *
 * @param ctx      The full Gate 3 context (job + persona + applicant)
 * @param variant  Optional prompt variant for A/B testing. Defaults to "balanced".
 * @returns        The LLM verdict: { approved, matchConfidence, matchReasoning, blockers }
 * @throws         If the LLM call fails or returns unparseable output
 */
export async function evaluateGate3(
  ctx: Gate3Context,
  variant: Gate3PromptVariant = "balanced",
): Promise<Gate3Verdict> {
  const systemPrompt = VARIANT_PROMPTS[variant] ?? GATE3_SYSTEM_PROMPT;
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildGate3Prompt(ctx) },
  ];

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: gate3VerdictSchema,
    messages,
  });

  return object;
}

// =============================================================================
// VERDICT MAPPING (§6.5)
// =============================================================================

/** The DB-level verdict string stored in matchQueue.llmVerdict. */
export type LlmVerdictString = "approved" | "rejected" | "error";

/**
 * Map the LLM verdict object to the DB-level verdict string.
 *
 * - approved=true  → "approved"
 * - approved=false → "rejected"
 * - error (caught) → "error"
 */
export function mapVerdict(verdict: Gate3Verdict): LlmVerdictString {
  return verdict.approved ? "approved" : "rejected";
}
