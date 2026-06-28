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
2. **Seniority fit**: Does the job's seniority level match the persona? Read the years of experience from the persona's self-description carefully. Do NOT reject solely because the persona summary says "5+ years" or "7+ years" and the job asks for "8+ years" — the stated number is a minimum in the persona summary, not a maximum. A persona with "7+ years" can qualify for a role asking 8+ years. Only reject on seniority if the gap is extreme (e.g., junior persona vs. principal/staff role requiring 12+ years).
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. If the job's Workplace Type is "on-site" and the applicant's assignment types do not include "on-site", that's a hard blocker. If the job's Workplace Type is "hybrid" and the applicant's assignment types do not include "hybrid", that's a hard blocker. If Workplace Type is null, infer from the location and description but do not assume remote — check carefully. Also check modalities and compliance preferences.
4. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
5. **Domain relevance**: Is the job in a domain the persona would plausibly work in? A React developer persona should match a SaaS frontend job, not a React Native game dev job (unless the persona explicitly mentions mobile).

OUTPUT RULES:
- Be conservative: only approve if you are confident this is a strong match. False positives waste the user's time; false negatives just mean the user sees fewer matches.
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

## APPLICANT HARD CONSTRAINTS
Country: ${applicant.country ?? "not specified"}
Can Work US Hours: ${applicant.canWorkUsHours ?? "not specified"}
Preferred Compliance: ${applicant.preferredCompliance.join(", ") || "any"}
Preferred Modalities: ${applicant.modalities.join(", ") || "any"}
Assignment Types: ${applicant.assignmentTypes.join(", ") || "any"}
Full Skill Knowledge Base: ${applicant.allTags.join(", ") || "none"}

## EVALUATION
Based on the above, is this job a strong match for this persona? Consider tech stack alignment, seniority fit, hard constraints (especially workplace type vs assignment types), and blocklist tags.`;
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
 * @param ctx  The full Gate 3 context (job + persona + applicant)
 * @returns    The LLM verdict: { approved, matchConfidence, matchReasoning, blockers }
 * @throws     If the LLM call fails or returns unparseable output
 */
export async function evaluateGate3(ctx: Gate3Context): Promise<Gate3Verdict> {
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
