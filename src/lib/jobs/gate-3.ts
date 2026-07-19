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
  // Work authorization risk flag (added July 2026). Set to true when the JD is
  // silent on work authorization/visa/citizenship requirements BUT the role is
  // hybrid or single-country-remote (not global). This surfaces the Ketryx-class
  // risk: work-auth requirements hidden in the application form, not the JD.
  // The job is NOT rejected — the flag warns the user to verify before applying.
  // NOTE: Must be .required (not .default) because OpenAI's strict JSON schema
  // mode requires all properties to be in the `required` array. The LLM is
  // instructed to always set this to true or false explicitly.
  workAuthRiskFlag: z
    .boolean()
    .describe(
      "Set true if the JD is silent on work authorization but the role is hybrid or single-country-remote (not global remote). Set false if the JD explicitly states work-auth requirements (handled as a hard blocker) or the role is global remote with no country restriction.",
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
    // Remote scope (added July 2026 — mismatch investigation). Structured
    // geo-fencing data from the normalizer's remote-scope extraction ladder.
    // Gives the LLM explicit fencing information instead of forcing it to
    // infer from the location string alone (which produced false approvals
    // for Poland-locked and US-only remote jobs).
    //   "global" = worldwide remote, "country_fenced" = restricted to specific
    //   countries (see locationCountries), "region_fenced" = restricted to a
    //   broad region, "onsite" = on-site/hybrid, "unknown"/"undetermined" =
    //   couldn't be determined.
    remoteScope?:
      | "global"
      | "country_fenced"
      | "region_fenced"
      | "onsite"
      | "unknown"
      | "undetermined"
      | null;
    // ISO 3166-1 alpha-2 country codes the job is fenced to (when
    // remoteScope = "country_fenced"). Null for other scopes.
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
    // Work authorization permits the applicant holds (added July 2026).
    // e.g. ["eu_citizen", "rwr_card_plus", "blue_card_eu"]. Empty/null when
    // the user hasn't set it — Gate 3 soft-fail-opens on the work-auth check
    // but may still set workAuthRiskFlag for hybrid/single-country-remote roles.
    workAuthorizations: string[];
  };
};

// =============================================================================
// GATE 3 SYSTEM PROMPT
// =============================================================================

const GATE3_SYSTEM_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a precise yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA:
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job (even if both are "frontend"). NOTE: Extracted tags are produced by an automated normalizer and may be incomplete — always check the job description for skills that may not appear in the extracted tags. Missing tags are a soft signal, not a hard blocker; the description is the source of truth.
   **PRIMARY STACK FROM TITLE (HARD BLOCKER)**: If the job TITLE explicitly names a primary technology (e.g., "Java Developer", "Python Engineer", "Fullstack Developer (Java + React)", "Go Backend Engineer", "C++ Programmer") and that technology is NOT in the persona's must-have tags, this is a HARD BLOCKER — reject immediately. The title declares the role's primary stack; do not approve based on secondary/ancillary tag overlap (e.g., a "Java + React" job is a Java role that also uses React, not a React role that also uses Java). This rule only applies when the title names a specific programming language/framework — generic titles like "Software Engineer" or "Full Stack Developer" without a named technology do not trigger this rule.
2. **Seniority fit**: Does the job's seniority level match the persona? Read the years of experience from the persona's self-description carefully. Do NOT reject solely because the persona summary says "5+ years" or "7+ years" and the job asks for "8+ years" — the stated number is a minimum in the persona summary, not a maximum. A persona with "7+ years" can qualify for a role asking 8+ years. Only reject on seniority if the gap is extreme (e.g., junior persona vs. principal/staff role requiring 12+ years). If the persona has specified preferred seniority levels, only reject if the job's inferred seniority is NOT among the persona's selected levels. If the persona's seniority levels are empty or "any", do not reject on seniority.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. If the job's Workplace Type is "on-site" and the applicant's assignment types do not include "on-site" or "hybrid", that's a hard blocker. If the job's Workplace Type is "hybrid", check the LOCATION: if the hybrid job is in the applicant's country (or a country they can work in), treat it as a SOFT concern — many hybrid roles offer remote options for the right candidate. BUT if the hybrid job is in a DIFFERENT country than the applicant's, this is a HARD BLOCKER — the applicant cannot commute to a foreign country for hybrid work, regardless of seniority or contractor status. If Workplace Type is null, infer from the location: if the location is a specific city/country (e.g., "Pune, India", "Hong Kong", "Kuala Lumpur") and does NOT contain remote indicators ("remote", "global", "worldwide", "anywhere", "distributed"), infer ON-SITE and reject if the applicant is in a different country. If the location contains remote indicators or is a broad region (e.g., "European Union", "EMEA", "Remote"), do not assume on-site — evaluate based on the JD text. Also check modalities and compliance preferences.
4. **Country-specific remote restrictions**: Many remote jobs restrict applications to specific countries or regions. The Remote Scope field provides structured geo-fencing data from the normalizer — USE IT as the primary signal:
   - Remote Scope = "country_fenced" with locationCountries listed: the job is restricted to those specific countries. If the applicant's Country is NOT in the list, apply the compliance rules below.
   - Remote Scope = "region_fenced": the job is restricted to a broad region (e.g., APAC, EMEA, Latam). If the applicant's Country is NOT in that region, this is a HARD BLOCKER (unless the applicant has relevant compliance/work authorization for that region).
   - Remote Scope = "global": the job is worldwide remote — no geographic restrictions.
   - Remote Scope = "unknown"/"undetermined"/null: fall back to scanning the job description and location string for geographic limitations like "remote (US only)", "must be located in [country/region]", "must reside in [country]", "remote within [region]". Also check the Location field for country names alongside "Remote" (e.g., "Poland / Remote / Poland" means remote-within-Poland, NOT global remote).
   If the applicant's Country does not match the job's remote geographic restriction, check the APPLICANT's compliance preferences (not the job's — the job will never state compliance arrangements):
   - If the APPLICANT's preferred compliance includes "w8ben" or "ic_global", US/North America geographic restrictions are NOT automatic hard blockers — DEFAULT TO APPROVING unless the job EXPLICITLY requires W-2 employment. Check the job posting's employment-type language:
     * KEY DISTINCTION: "full-time" is a MODALITY, not an employment type. ATS systems report "Full-time" for both W-2 employees AND B2B contractors. "Full-time" alone is NOT a W-2 signal — the applicant's modalities include "full-time", meaning they are open to full-time B2B contracting.
     * CONTRACTOR-FRIENDLY (SOFT concern — approve if tech stack aligns): The job mentions "contractor", "contract", "1099", "freelance", "B2B", "independent contractor", "consultant", OR does NOT specify any employment type, OR only says "full-time" without "employee" or "W-2". ABSENCE of contractor-friendly language is NOT a hard blocker — most ATS postings don't mention contractor arrangements even when they accept them.
     * W-2 EMPLOYEE ONLY (HARD BLOCKER): The job EXPLICITLY says "W-2", "W-2 employee", "full-time employee on US payroll", "must be a US employee", "must be authorized to work in the US" AND mentions "employee"/"payroll"/"benefits", "visa sponsorship", "green card", "US citizen", "permanent resident", "direct hire", or mentions payroll/benefits/health insurance/401(k) as part of the compensation. Each signal must be EXPLICIT — do not infer W-2 status from the absence of contractor language.
     * Country-specific restrictions for OTHER countries (Colombia, Japan, Australia, Argentina, etc.) are ALWAYS HARD BLOCKERS regardless of compliance — w8ben/ic_global only covers US/North America contractor arrangements.
   - If the APPLICANT does NOT have w8ben or ic_global compliance, and the job explicitly restricts to a country/region that does not include the applicant's country, this is a HARD BLOCKER.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in? A React developer persona should match a SaaS frontend job, not a React Native game dev job (unless the persona explicitly mentions mobile).
7. **Work authorization requirements**: Scan the job description for explicit work authorization, citizenship, or visa/permit requirements: "EU citizenship required", "must hold [country] work permit", "RWR Card Plus", "Blue Card EU", "settled status", "no visa sponsorship", "must be authorized to work in [country]", "US citizen or permanent resident only". Check the APPLICANT's workAuthorizations field (not the job's — jobs state requirements, applicants hold permits):
   - If the job requires a specific citizenship/permit and the applicant's workAuthorizations does NOT include it (or a superset like eu_citizen covering EU-wide requirements), this is a HARD BLOCKER — reject. The applicant cannot legally work in that jurisdiction.
   - If the job says "no visa sponsorship" or "no sponsorship provided" and the applicant does not have work authorization for that country, this is a HARD BLOCKER.
   - If the applicant HAS the required permit (e.g., job requires "EU citizenship" and applicant has "eu_citizen"), this is NOT a blocker — approve if other criteria align.
   - WORK AUTH RISK FLAG: If the JD is SILENT on work authorization/visa/citizenship BUT the role is hybrid OR the location is "Remote - [specific country/region]" (not "Remote - Global" or "Remote - Worldwide"), set workAuthRiskFlag=true. This warns the user to verify work authorization before applying — many employers hide citizenship/permit requirements in the application form, not the JD. If the JD explicitly states work-auth requirements (handled above) or the role is global remote with no country restriction, set workAuthRiskFlag=false. CRITICAL: workAuthRiskFlag is a WARNING for the user, NOT a rejection reason — never list it in blockers and never reject solely because of it.
     IMPORTANT: The location field alone is NOT sufficient to determine single-country-remote. Many ATS systems set the location to a specific city/country (e.g., "Delhi", "India", "Kraków") even for genuinely global remote roles. You MUST check the JD TEXT for global remote indicators before flagging. Do NOT set workAuthRiskFlag=true if the JD contains any of these global remote signals:
     - "global, remote-first" / "remote-first organization" / "global remote"
     - "work from anywhere" / "work from any location" / "any country"
     - "worldwide" / "distributed team" / "distributed workforce"
     - "team members across N countries" / "operates in N+ countries"
     - "Remote, Global" or "Remote - Worldwide" in the title or location
     If the JD text explicitly says the role is global remote (even if the location field says a specific country), set workAuthRiskFlag=false — the role is open to applicants worldwide.
8. **Management/PM role detection (HARD BLOCKER)**: If the job TITLE contains management or product management keywords ("Manager", "Engineering Manager", "Engineering Director", "Head of", "VP of", "Chief", "Director of Engineering", "Product Manager", "Program Manager", "PM", "Tech Lead", "Team Lead") AND the persona's seniority levels are IC-only (e.g., "mid", "junior", "senior" — without "lead", "staff", "principal", "manager"), this is a HARD BLOCKER — the persona is an individual contributor, not a management track. A "Senior Engineer" is not the same as a "Senior Engineering Manager" — the former codes, the latter manages coders. Only allow management roles if the persona's seniority levels explicitly include "lead", "manager", "staff", or "principal".
9. **Role relevance (HARD BLOCKER)**: The persona is a SOFTWARE DEVELOPER (web-dev, full-stack, frontend, backend, AI/ML engineer). If the job TITLE indicates a NON-DEVELOPMENT role — including sales ("Account Executive", "Sales Engineer", "Account Manager", "Business Development"), customer success ("Customer Success Manager", "Customer Success Engineer" when the role is primarily relationship management not coding), finance/bookkeeping ("Bookkeeper", "Accountant", "Financial Analyst"), marketing ("Marketing Manager", "Growth Manager"), operations ("Operations Manager", "Chief of Staff"), IT support ("IT Support", "Help Desk", "Systems Administrator" when the role is infrastructure not software development), or other non-engineering roles — this is a HARD BLOCKER. The persona builds software; a "Federal AE" or "Bookkeeper" is not a software development role regardless of tech-stack overlap in the tags. EXCEPTION: "Sales Engineer" and "Developer Advocate" / "DevRel" roles MAY be acceptable if the persona's tags include relevant technologies AND the job description involves coding/building (not just selling). When in doubt, reject — the persona's time is better spent on real engineering roles.
10. **Scope text-scan (HARD BLOCKER — catches classifier false-globals)**: Even when the Remote Scope field says "global", SCAN THE JOB DESCRIPTION TEXT for geographic restrictions that the classifier missed. If the JD contains phrases like "must be located in [country]", "must reside in [country/region]", "only accepting applications from [country]", "remote (US only)", "remote within [region]", "[country] only", "must have [country] work permit", "must be [country] citizen", or similar geographic fencing language, AND the applicant's country does NOT match the restriction (and the applicant does not have compliance covering that country), this is a HARD BLOCKER — reject. The remote_scope classifier is imperfect; Gate 3 is the last line of defense against false-globals reaching the user. Log the blocker as "scope_text_restriction: [quoted phrase from JD]" so the classifier audit stream can catch the pattern.
11. **US-benefits soft-geo deduction (D19 — catches false-globals that lack explicit geo-fence language)**: Even when the JD does NOT contain explicit country-restriction language (criterion 10), scan for US-only benefits/employment-package signals that indicate the role is US-anchored despite a "global" or "unknown" remote scope. The following signals, when present WITHOUT explicit "international"/"anywhere"/"worldwide" hiring language, indicate a US-only role and should be treated as country-fence evidence:
    - US-specific benefits package: 401(k), US medical/dental/vision insurance, HSA/FSA, W-2, at-will employment language
    - E-Verify participation (US work-authorization verification system)
    - US-office-anchored hybrid expectations (e.g., "must be within 50 miles of [US city]", "must come into the office in [US city] occasionally")
    - US-equity framing: Carta stock options, US-style vesting schedules, "US employees only" equity language
    When 2+ of these signals are present and the JD does NOT explicitly state international/anywhere hiring, AND the applicant is NOT based in the US (and does not have US work authorization), this is a HARD BLOCKER — reject. Log the blocker as "us_benefits_soft_geo: [list the signals found]". This encodes the deduction a human reader would perform: a job advertising 401(k) + E-Verify + US medical is a US-only job, regardless of what the remote_scope field says.

OUTPUT RULES:
- Be balanced: approve if the tech stack and seniority align well, even if there are soft concerns (location, compliance, hybrid workplace in applicant's country). Only reject for HARD blockers (completely wrong tech stack, on-site when applicant is remote-only with no hybrid flexibility, hybrid job in a FOREIGN country where the applicant cannot commute, blocklist tags, non-US country restrictions without compliance, EXPLICIT W-2-only US jobs for international contractors, work authorization requirements the applicant cannot satisfy, null workplace type with a specific foreign city location, management/PM roles for IC-only personas, NON-DEVELOPMENT roles for software developer personas, geographic restrictions in the JD text that the classifier missed). Soft concerns (US-only remote with w8ben compliance and ambiguous or no W-2 language, hybrid workplace in the applicant's OWN country) should be noted in the reasoning but should NOT cause rejection. When the applicant has w8ben/ic_global compliance and the job is US-only remote without explicit W-2/employee language, DEFAULT TO APPROVING with workAuthRiskFlag=true.
- workAuthRiskFlag is a WARNING for the user, NOT a rejection reason. Never list "work authorization risk" in the blockers array. Never reject a job solely because of work authorization uncertainty — the flag exists so the user can verify before applying.
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

  // Dynamic compliance directive — when the applicant has w8ben or ic_global
  // compliance, explicitly tell the LLM how to handle US/North America remote
  // restrictions. The directive distinguishes between contractor-friendly
  // postings (approve — the company is open to B2B/1099 engagements) and
  // W-2-only postings (hard blocker — the company wants a US payroll employee).
  // Without this directive, the LLM was treating "Remote - United States" as
  // a hard geographic blocker even when the applicant had w8ben compliance,
  // causing 0% approval for US-only remote jobs. The initial fix (treating ALL
  // US-only as soft) was too broad — community research shows only ~2-5% of
  // "US only" postings actually accept international contractors. The nuanced
  // directive checks employment-type language to reduce false positives.
  // The directive is placed prominently in the user prompt so the LLM doesn't
  // have to reason about the rule from the compliance list — it's told directly.
  const contractorCompliance = applicant.preferredCompliance.filter(
    (c) => c === "w8ben" || c === "ic_global",
  );
  const hasContractorCompliance = contractorCompliance.length > 0;

  const complianceDirective = hasContractorCompliance
    ? `\n## COMPLIANCE DIRECTIVE (READ BEFORE EVALUATING)\nThe applicant HAS ${contractorCompliance.join(" and ")} compliance. This means they can work as an international contractor for US companies via W-8BEN or EOR (Employer of Record) arrangements.\n\n### STEP 1: CHECK COUNTRY RESTRICTIONS FIRST (before considering compliance)\nIf the job is country_fenced with a locationCountries list, check the applicant's Country against that list:\n- If the applicant's Country IS in the list → no geographic blocker, proceed to Step 2.\n- If the applicant's Country is NOT in the list, check if the US is in the list:\n  * If the list contains the US (alone or with other countries like ["US"], ["US", "CA"], ["US", "CA", "MX"]): proceed to Step 2 (w8ben compliance may cover US contractor arrangements).\n  * If the list does NOT contain the US (Canada-only, Portugal, Poland, Mexico, India, Chile, Costa Rica, Brazil, UK, Germany, etc.): this is a **HARD BLOCKER — REJECT IMMEDIATELY**. w8ben/ic_global compliance only covers US contractor arrangements. The applicant cannot legally work in those jurisdictions. Do NOT approve regardless of tech stack alignment, seniority, or any other factor.\n\n### STEP 2: US COMPLIANCE RULES (only if Step 1 passed)\nMany US-only remote jobs accept international contractors — DEFAULT TO APPROVING US-only remote jobs when the applicant has w8ben/ic_global compliance, unless the job EXPLICITLY requires W-2 employment.\n\nKEY DISTINCTION — "full-time" is a MODALITY, not an employment type:\n- ATS systems report "Full-time" as the employment type for BOTH W-2 employees AND B2B contractors. "Full-time" alone is NOT a W-2 signal.\n- The applicant's modalities include "full-time" — they are explicitly open to full-time B2B contracting.\n- Only treat "full-time" as a W-2 signal if the job EXPLICITLY says "full-time employee", "W-2 employee", "full-time on US payroll", or similar phrasing that pairs "full-time" with "employee" or "W-2".\n\nCONTRACTOR-FRIENDLY (SOFT concern — approve if tech stack and seniority align):\n- The job mentions "contractor", "contract", "1099", "freelance", "B2B", "independent contractor", "consultant"\n- The job does NOT specify any employment type, or only says "full-time" / "part-time" without "employee" or "W-2"\n- The job's employment type is ambiguous — DEFAULT TO APPROVING with workAuthRiskFlag=true so the user can verify in the application form\n- ABSENCE of contractor-friendly language is NOT a hard blocker — most ATS postings don't mention contractor arrangements even when they accept them\n\nW-2 EMPLOYEE ONLY (HARD BLOCKER — reject even with w8ben compliance):\n- The job EXPLICITLY says "W-2", "W-2 employee", "full-time employee on US payroll", "must be a US employee"\n- The job says "must be authorized to work in the US" AND mentions "employee", "payroll", "benefits", or "visa sponsorship"\n- The job mentions "green card", "US citizen", "permanent resident" as a requirement\n- The job mentions "direct hire", "health insurance", "401(k)" as part of the compensation package\n- IMPORTANT: Each of these signals must be EXPLICIT in the job description. Do not infer W-2 status from the absence of contractor language.\n\nCRITICAL: workAuthRiskFlag is a WARNING for the user, NOT a rejection reason. Never list workAuthRiskFlag or "work authorization risk" in the blockers array. Never reject a job solely because of work authorization risk — the flag exists so the user can verify before applying.\n`
    : "";

  // Work authorization directive — tells the LLM what permits the applicant
  // holds so it can check against jobs that require specific work authorization
  // (EU citizenship, RWR Card Plus, Blue Card EU, UK settled status, etc.).
  // Parallel to the compliance directive above, but for work-permit/citizenship
  // requirements rather than employment-type/compliance arrangements.
  // When the applicant has no work authorizations set, the directive is
  // omitted (soft-fail-open) — but the LLM is still instructed via criterion 7
  // in the system prompt to set workAuthRiskFlag for hybrid/single-country-remote
  // roles with silent JDs.
  const workAuthList = applicant.workAuthorizations.filter(
    (w) => w.trim().length > 0,
  );
  const hasWorkAuth = workAuthList.length > 0;

  const workAuthDirective = hasWorkAuth
    ? `\n## WORK AUTHORIZATION DIRECTIVE\nThe applicant holds these work authorizations: ${workAuthList.join(", ")}\n\nPermit coverage:\n- eu_citizen: right to work in ALL EU/EEA member states (covers any "EU citizenship required" or "EU work permit" requirement)\n- rwr_card_plus: Austrian Red-White-Red Card Plus (right to work in Austria for non-EU nationals)\n- blue_card_eu: EU Blue Card (right to work in the issuing EU member state for highly qualified workers)\n- uk_settled: UK settled status (right to work in the UK)\n- uk_pre_settled: UK pre-settled status (right to work in the UK under the EU Settlement Scheme)\n- us_green_card: US permanent resident (right to work in the US)\n- us_citizen: US citizen (right to work in the US)\n- canadian_pr: Canadian permanent resident (right to work in Canada)\n- swiss_permit_c: Switzerland settled permit (right to work in Switzerland)\n- other_permit: other work permit (check the job's country requirement carefully)\n\nWhen evaluating jobs:\n- If the job requires EU citizenship or an EU work permit and the applicant has "eu_citizen", that is a MATCH (NOT a blocker).\n- If the job requires a specific named permit (e.g., "RWR Card Plus") and the applicant has it, that is a MATCH.\n- If the job requires a permit the applicant does NOT have, this is a HARD BLOCKER — reject.\n- If the JD is silent on work authorization but the role is hybrid or single-country-remote (not global), set workAuthRiskFlag=true to warn the user to verify before applying.\n- IMPORTANT: Check the JD TEXT for global remote indicators ("global, remote-first", "work from anywhere", "worldwide", "distributed team", "across N countries", "Remote, Global") before flagging. Many ATS systems set the location field to a specific city/country even for global remote roles. If the JD text says global remote, do NOT set workAuthRiskFlag=true.\n`
    : "";

  return `## JOB POSTING
Title: ${job.title}
Workplace Type: ${job.workplaceType ?? "not specified"}
Location: ${job.locationName ?? "not specified"}
Remote Scope: ${job.remoteScope ?? "not specified"}${job.locationCountries && job.locationCountries.length > 0 ? ` (restricted to: ${job.locationCountries.join(", ")})` : ""}
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
Work Authorizations: ${workAuthList.join(", ") || "none specified"}
Full Skill Knowledge Base: ${applicant.allTags.join(", ") || "none"}
${complianceDirective}${workAuthDirective}
## EVALUATION
Based on the above, is this job a strong match for this persona? Consider tech stack alignment, seniority fit, hard constraints (especially workplace type vs assignment types, country-specific remote restrictions, and work authorization requirements), blocklist tags, and management/PM role detection. Set workAuthRiskFlag=true if the JD is silent on work authorization but the role is hybrid or single-country-remote (not global) — but first check the JD text for global remote indicators ("global, remote-first", "work from anywhere", "worldwide", "distributed team", "across N countries", "Remote, Global"); if the JD says global remote, set workAuthRiskFlag=false even if the location field says a specific country. CRITICAL: workAuthRiskFlag is a WARNING, not a rejection reason — never list it in blockers and never reject because of it.${hasContractorCompliance ? " Remember: the applicant has w8ben/ic_global compliance (see COMPLIANCE DIRECTIVE above). FIRST check if the job is country-fenced to a country list that does NOT include the US — if so, REJECT immediately (w8ben only covers US contractor arrangements). Only if the list includes the US: DEFAULT TO APPROVING unless the job EXPLICITLY requires W-2 employment. 'full-time' alone is NOT a W-2 signal — only 'full-time employee', 'W-2 employee', or explicit payroll/benefits/visa language counts. ABSENCE of contractor-friendly language is NOT a hard blocker." : ""}${hasWorkAuth ? " Remember: the applicant holds work authorizations (see WORK AUTHORIZATION DIRECTIVE above) — check whether the job requires permits the applicant has (match) or lacks (hard blocker)." : ""}`;
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
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. On-site job + no on-site/hybrid assignment = hard blocker. Hybrid job: if in the applicant's country, soft concern (many hybrid roles offer remote options). Hybrid job in a DIFFERENT country = HARD BLOCKER (applicant cannot commute to a foreign country). If Workplace Type is null, infer from the location: if it's a specific city/country without remote indicators ("remote", "global", "worldwide"), infer on-site and reject if applicant is in a different country. If the location contains remote indicators or is a broad region, evaluate based on JD text.
4. **Country-specific remote restrictions**: Scan the job description for geographic limitations like "remote (US only)", "must be located in [country]", "must reside in [country]". Check the APPLICANT's compliance preferences (not the job's — jobs never state compliance arrangements):
   - If the APPLICANT HAS w8ben or ic_global compliance, DEFAULT TO APPROVING US/North America restrictions unless the job EXPLICITLY requires W-2 employment. KEY: "full-time" is a modality, not a W-2 signal — ATS systems report "Full-time" for both W-2 and B2B contractors. Only treat it as W-2 if paired with "employee" or "W-2". If the job mentions "contractor", "1099", "freelance", "B2B", or doesn't specify employment type, or only says "full-time" without "employee"/"W-2", treat US/North America restrictions as a SOFT concern. If it EXPLICITLY says "W-2 employee", "full-time employee on US payroll", "must be authorized to work in the US" AND mentions employee/payroll/benefits, "visa sponsorship", "green card", or mentions payroll/benefits/401(k), it's a HARD BLOCKER. ABSENCE of contractor language is NOT a hard blocker. Country-specific restrictions for OTHER countries (Colombia, Japan, etc.) are ALWAYS HARD BLOCKERS.
   - If the APPLICANT does NOT have w8ben or ic_global compliance, and the restriction excludes the applicant's country, this is a HARD BLOCKER.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in?
7. **Work authorization requirements**: Scan the job description for explicit work authorization, citizenship, or visa/permit requirements: "EU citizenship required", "must hold [country] work permit", "RWR Card Plus", "Blue Card EU", "settled status", "no visa sponsorship", "must be authorized to work in [country]". Check the APPLICANT's workAuthorizations field:
   - If the job requires a specific citizenship/permit the applicant does NOT have, this is a HARD BLOCKER — reject.
   - If the job says "no visa sponsorship" and the applicant lacks work authorization for that country, this is a HARD BLOCKER.
   - If the applicant HAS the required permit, this is NOT a blocker.
   - WORK AUTH RISK FLAG: If the JD is SILENT on work authorization BUT the role is hybrid OR single-country-remote (not global), set workAuthRiskFlag=true. Otherwise false. CRITICAL: workAuthRiskFlag is a WARNING, NOT a rejection reason — never list it in blockers. IMPORTANT: Check the JD TEXT for global remote indicators ("global, remote-first", "work from anywhere", "worldwide", "distributed team", "across N countries", "Remote, Global") before flagging — many ATS systems set the location to a specific city even for global remote roles. If the JD text says global remote, set workAuthRiskFlag=false.
8. **Management/PM role detection (HARD BLOCKER)**: If the job TITLE contains management or product management keywords ("Manager", "Engineering Manager", "Engineering Director", "Head of", "VP of", "Chief", "Director of Engineering", "Product Manager", "Program Manager", "PM", "Tech Lead", "Team Lead") AND the persona's seniority levels are IC-only (e.g., "mid", "junior", "senior" — without "lead", "staff", "principal", "manager"), this is a HARD BLOCKER — the persona is an individual contributor, not a management track. Only allow management roles if the persona's seniority levels explicitly include "lead", "manager", "staff", or "principal".

OUTPUT RULES:
- Be STRICT but fair: only reject for genuine hard blockers (wrong tech stack, on-site mismatch without hybrid flexibility, hybrid job in a FOREIGN country, blocklist tags, non-US country restrictions without contractor compliance, EXPLICIT W-2-only US jobs for international contractors, work authorization requirements the applicant cannot satisfy, null workplace type with a specific foreign city location, management/PM roles for IC-only personas, NON-DEVELOPMENT roles for software developer personas, geographic restrictions in the JD text that the classifier missed). Soft concerns (hybrid workplace in the applicant's OWN country, US-only remote with w8ben compliance and ambiguous/no W-2 language) should be noted but should NOT cause rejection.
- workAuthRiskFlag is a WARNING for the user, NOT a rejection reason. Never list "work authorization risk" in blockers. Never reject solely because of work authorization uncertainty.
- If rejected, list ALL blockers in the blockers array.
- matchReasoning should be 1–3 sentences explaining the key factor(s) in your decision.
- matchConfidence reflects your certainty, not the match quality.`;

const GATE3_THOROUGH_PROMPT = `You are an expert technical recruiter evaluating whether a job posting is a strong match for a specific developer persona.

Your job is to make a careful yes/no decision. You are the final gate — the candidate has already passed tag overlap and semantic similarity filters, so your role is to catch nuanced mismatches that keyword matching cannot.

EVALUATION CRITERIA (reason step by step before deciding):
1. **Tech stack alignment**: Do the job's required skills match the persona's must-have tags? A persona with "react, nextjs, typescript" should match a React job, not a Vue job. NOTE: Extracted tags are produced by an automated normalizer and may be incomplete — always check the job description for skills that may not appear in the extracted tags. Consider both the must-have tags AND the applicant's full skill knowledge base — if the job requires a skill the applicant knows but it's not in the must-have tags, that's still a positive signal.
2. **Seniority fit**: Does the job's seniority level match the persona? Read the years of experience from the persona's self-description carefully. Do NOT reject solely because the persona summary says "5+ years" and the job asks for "8+ years" — the stated number is a minimum. If the persona has specified preferred seniority levels, only reject if the job's inferred seniority is NOT among the selected levels. If the persona's seniority levels are empty or "any", do not reject on seniority.
3. **Hard constraints (blockers)**: Check the applicant's assignment types against the job's structured workplace type. If the job's Workplace Type is "on-site" and the applicant's assignment types do not include "on-site" or "hybrid", that's a hard blocker. If the job's Workplace Type is "hybrid", check the LOCATION: if the hybrid job is in the applicant's country, treat it as a SOFT concern — many hybrid roles offer remote options for senior contractors. BUT if the hybrid job is in a DIFFERENT country than the applicant's, this is a HARD BLOCKER — the applicant cannot commute to a foreign country for hybrid work, regardless of seniority or contractor status. If Workplace Type is null, infer from the location: if the location is a specific city/country (e.g., "Pune, India", "Hong Kong", "Kuala Lumpur") and does NOT contain remote indicators ("remote", "global", "worldwide", "anywhere", "distributed"), infer ON-SITE and reject if the applicant is in a different country. If the location contains remote indicators or is a broad region (e.g., "European Union", "EMEA", "Remote"), do not assume on-site — evaluate based on the JD text. Also check modalities and compliance preferences.
4. **Country-specific remote restrictions**: Many remote jobs restrict applications to specific countries or regions. Carefully scan the job description for phrases like "remote (US only)", "must be located in [country/region]", "must reside in [country]", "remote within [region]", or similar geographic limitations. If the applicant's Country does not match, check the APPLICANT's compliance preferences (not the job's — jobs never state compliance arrangements):
   - If the APPLICANT has "w8ben" or "ic_global" compliance, DEFAULT TO APPROVING US/North America restrictions unless the job EXPLICITLY requires W-2 employment. KEY: "full-time" is a modality, not a W-2 signal — ATS systems report "Full-time" for both W-2 and B2B contractors, and the applicant's modalities include "full-time" (they are open to full-time B2B contracting). If the job mentions "contractor", "1099", "freelance", "B2B", or doesn't specify employment type, or only says "full-time" without "employee"/"W-2", treat US restrictions as a SOFT concern. If it EXPLICITLY says "W-2 employee", "full-time employee on US payroll", "must be authorized to work in the US" AND mentions employee/payroll/benefits, "visa sponsorship", "green card", or mentions payroll/benefits/401(k), it's a HARD BLOCKER. ABSENCE of contractor language is NOT a hard blocker — most ATS postings don't mention contractor arrangements even when they accept them. Country-specific restrictions for OTHER countries (Colombia, Japan, Australia, Argentina, etc.) are ALWAYS HARD BLOCKERS even with w8ben compliance.
   - If the APPLICANT does NOT have w8ben or ic_global compliance, and the restriction excludes the applicant's country, this is a HARD BLOCKER.
5. **Blocklist tags**: If any of the job's tags appear in the persona's blocklist, reject immediately.
6. **Domain relevance**: Is the job in a domain the persona would plausibly work in? Consider transferable skills — a React developer can plausibly work in most SaaS/web product domains.
7. **Work authorization requirements**: Scan the job description for explicit work authorization, citizenship, or visa/permit requirements: "EU citizenship required", "must hold [country] work permit", "RWR Card Plus", "Blue Card EU", "settled status", "no visa sponsorship", "must be authorized to work in [country]". Check the APPLICANT's workAuthorizations field:
   - If the job requires a specific citizenship/permit the applicant does NOT have, this is a HARD BLOCKER — reject. The applicant cannot legally work in that jurisdiction.
   - If the job says "no visa sponsorship" and the applicant lacks work authorization for that country, this is a HARD BLOCKER.
   - If the applicant HAS the required permit (e.g., job requires "EU citizenship" and applicant has "eu_citizen"), this is NOT a blocker — approve if other criteria align.
   - WORK AUTH RISK FLAG: If the JD is SILENT on work authorization/visa/citizenship BUT the role is hybrid OR the location is "Remote - [specific country/region]" (not "Remote - Global" or "Remote - Worldwide"), set workAuthRiskFlag=true. This warns the user to verify work authorization before applying — many employers hide citizenship/permit requirements in the application form, not the JD. If the JD explicitly states work-auth requirements or the role is global remote, set workAuthRiskFlag=false. CRITICAL: workAuthRiskFlag is a WARNING for the user, NOT a rejection reason — never list it in blockers and never reject solely because of it.
     IMPORTANT: The location field alone is NOT sufficient to determine single-country-remote. Many ATS systems set the location to a specific city/country (e.g., "Delhi", "India", "Kraków") even for genuinely global remote roles. You MUST check the JD TEXT for global remote indicators before flagging. Do NOT set workAuthRiskFlag=true if the JD contains any of these global remote signals:
     - "global, remote-first" / "remote-first organization" / "global remote"
     - "work from anywhere" / "work from any location" / "any country"
     - "worldwide" / "distributed team" / "distributed workforce"
     - "team members across N countries" / "operates in N+ countries"
     - "Remote, Global" or "Remote - Worldwide" in the title or location
     If the JD text explicitly says the role is global remote (even if the location field says a specific country), set workAuthRiskFlag=false — the role is open to applicants worldwide.
8. **Management/PM role detection (HARD BLOCKER)**: If the job TITLE contains management or product management keywords ("Manager", "Engineering Manager", "Engineering Director", "Head of", "VP of", "Chief", "Director of Engineering", "Product Manager", "Program Manager", "PM", "Tech Lead", "Team Lead") AND the persona's seniority levels are IC-only (e.g., "mid", "junior", "senior" — without "lead", "staff", "principal", "manager"), this is a HARD BLOCKER — the persona is an individual contributor, not a management track. A "Senior Engineer" is not the same as a "Senior Engineering Manager" — the former codes, the latter manages coders. Only allow management roles if the persona's seniority levels explicitly include "lead", "manager", "staff", or "principal".
9. **Role relevance (HARD BLOCKER)**: The persona is a SOFTWARE DEVELOPER (web-dev, full-stack, frontend, backend, AI/ML engineer). If the job TITLE indicates a NON-DEVELOPMENT role — including sales ("Account Executive", "Sales Engineer", "Account Manager", "Business Development"), customer success ("Customer Success Manager", "Customer Success Engineer" when the role is primarily relationship management not coding), finance/bookkeeping ("Bookkeeper", "Accountant", "Financial Analyst"), marketing ("Marketing Manager", "Growth Manager"), operations ("Operations Manager", "Chief of Staff"), IT support ("IT Support", "Help Desk", "Systems Administrator" when the role is infrastructure not software development), or other non-engineering roles — this is a HARD BLOCKER. The persona builds software; a "Federal AE" or "Bookkeeper" is not a software development role regardless of tech-stack overlap in the tags. EXCEPTION: "Sales Engineer" and "Developer Advocate" / "DevRel" roles MAY be acceptable if the persona's tags include relevant technologies AND the job description involves coding/building (not just selling). When in doubt, reject — the persona's time is better spent on real engineering roles.
10. **Scope text-scan (HARD BLOCKER — catches classifier false-globals)**: Even when the Remote Scope field says "global", SCAN THE JOB DESCRIPTION TEXT for geographic restrictions that the classifier missed. If the JD contains phrases like "must be located in [country]", "must reside in [country/region]", "only accepting applications from [country]", "remote (US only)", "remote within [region]", "[country] only", "must have [country] work permit", "must be [country] citizen", or similar geographic fencing language, AND the applicant's country does NOT match the restriction (and the applicant does not have compliance covering that country), this is a HARD BLOCKER — reject. The remote_scope classifier is imperfect; Gate 3 is the last line of defense against false-globals reaching the user. Log the blocker as "scope_text_restriction: [quoted phrase from JD]" so the classifier audit stream can catch the pattern.
11. **US-benefits soft-geo deduction (D19 — catches false-globals that lack explicit geo-fence language)**: Even when the JD does NOT contain explicit country-restriction language (criterion 10), scan for US-only benefits/employment-package signals that indicate the role is US-anchored despite a "global" or "unknown" remote scope. The following signals, when present WITHOUT explicit "international"/"anywhere"/"worldwide" hiring language, indicate a US-only role and should be treated as country-fence evidence:
    - US-specific benefits package: 401(k), US medical/dental/vision insurance, HSA/FSA, W-2, at-will employment language
    - E-Verify participation (US work-authorization verification system)
    - US-office-anchored hybrid expectations (e.g., "must be within 50 miles of [US city]", "must come into the office in [US city] occasionally")
    - US-equity framing: Carta stock options, US-style vesting schedules, "US employees only" equity language
    When 2+ of these signals are present and the JD does NOT explicitly state international/anywhere hiring, AND the applicant is NOT based in the US (and does not have US work authorization), this is a HARD BLOCKER — reject. Log the blocker as "us_benefits_soft_geo: [list the signals found]". This encodes the deduction a human reader would perform: a job advertising 401(k) + E-Verify + US medical is a US-only job, regardless of what the remote_scope field says.

OUTPUT RULES:
- Be thorough: consider all criteria before deciding. A match doesn't require perfection — it requires plausibility. If the core tech stack aligns and there are no hard blockers, lean toward approving. Soft concerns (hybrid workplace in the applicant's OWN country, US-only remote with w8ben compliance and ambiguous/no W-2 language) should be noted but should NOT cause rejection. When the applicant has w8ben/ic_global compliance and the job is US-only remote without explicit W-2/employee language, DEFAULT TO APPROVING with workAuthRiskFlag=true. HARD blockers include: hybrid job in a FOREIGN country (applicant cannot commute), null workplace type with a specific foreign city location (infer on-site), management/PM roles for IC-only personas, NON-DEVELOPMENT roles for software developer personas, geographic restrictions in the JD text that the classifier missed.
- workAuthRiskFlag is a WARNING for the user, NOT a rejection reason. Never list "work authorization risk" in the blockers array. Never reject a job solely because of work authorization uncertainty — the flag exists so the user can verify before applying.
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

// =============================================================================
// REJECTION REASON CLASSIFICATION (v4 lock §1-A.4)
// =============================================================================

/**
 * Structured rejection reason enum values (matches the pgEnum).
 */
export type RejectionReason =
  | "geo_country_fenced"
  | "geo_region_fenced"
  | "scope_text_restriction"
  | "non_development_role"
  | "management_role"
  | "stack_mismatch"
  | "seniority_mismatch"
  | "contract_compliance"
  | "stale"
  | "other";

/**
 * Classify free-text LLM blockers into a structured rejection_reason enum.
 *
 * This enables group-by queries without text parsing (v4 lock §1-A.4).
 * The classification is based on keyword matching against the blocker text.
 * If no category matches, "other" is returned.
 *
 * @param blockers The LLM's free-text blockers array
 * @returns The classified rejection reason
 */
export function classifyRejectionReason(blockers: string[]): RejectionReason {
  if (!blockers || blockers.length === 0) return "other";

  const text = blockers.join(" ").toLowerCase();

  // Directive 09 Part B.1 — Scope text restriction (classifier false-global audit)
  // Check before geo_country_fenced — this is the specific pattern of the LLM
  // finding geographic restrictions in the JD text that the classifier missed.
  if (/scope_text_restriction/.test(text)) {
    return "scope_text_restriction";
  }

  // Directive 09 Part A.2 — Non-development role detection
  if (
    /\b(non-development|non-development role|not a software development|bookkeeper|account executive|sales role|accountant|financial analyst|marketing manager|operations manager|chief of staff|it support|help desk)\b/.test(
      text,
    )
  ) {
    return "non_development_role";
  }

  // Directive 09 Part A.2 — Management/PM role detection (separate from non-development)
  if (/management\/pm role|management role|pm role/.test(text)) {
    return "management_role";
  }

  // Geo-region fenced (check before country — "APAC", "EMEA", "Latam")
  if (
    /\b(apac|emea|latam|europe|asia|africa|north america|south america|balkans|eastern europe|western europe|region)\b/.test(
      text,
    )
  ) {
    return "geo_region_fenced";
  }

  // Geo-country fenced
  if (
    /\b(country|poland|india|canada|argentina|pakistan|ukraine|germany|france|netherlands|spain|italy|portugal|romania|bengaluru|mumbai|delhi|pune|gujarat|hong kong|singapore|reside|residency|authorized|eligible|location restriction|foreign country|commute|on-site|hybrid job)\b/.test(
      text,
    )
  ) {
    return "geo_country_fenced";
  }

  // Stack mismatch
  if (
    /\b(tech stack|must-have|java|spring|nodejs|node\.js|angular|python|fastapi|pixi|backend skill|frontend focus|next\.js|graphql|wrong tech|stack|alignment|primary.*language|core.*skill)\b/.test(
      text,
    )
  ) {
    return "stack_mismatch";
  }

  // Seniority mismatch
  if (
    /\b(seniority|senior|junior|mid|lead|staff|principal|years.*experience|overqualified|underqualified|inverted.*band)\b/.test(
      text,
    )
  ) {
    return "seniority_mismatch";
  }

  // Contract compliance
  if (
    /\b(contractor|compliance|employment|w-2|w2|visa|sponsorship|payroll|benefits|work authorization|work auth|citizenship|permit|green card)\b/.test(
      text,
    )
  ) {
    return "contract_compliance";
  }

  // Stale
  if (/\b(stale|expired|closed|no longer|removed|filled)\b/.test(text)) {
    return "stale";
  }

  return "other";
}
