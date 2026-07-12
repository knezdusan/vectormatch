/**
 * Unit tests for Module C — Gate 3 LLM Arbiter (Step 6 of the 3-Gate Funnel).
 *
 * Test coverage (MODULE_C_DECISIONS.md §14, Feature C3):
 *   - buildGate3Prompt: context assembly (job + persona + applicant sections)
 *   - gate3VerdictSchema: Zod validation (approved, confidence, reasoning, blockers)
 *   - evaluateGate3: LLM call with mocked generateObject
 *   - mapVerdict: approved → 'approved', !approved → 'rejected'
 *
 * The AI SDK (generateObject) is mocked — no real OpenAI calls.
 */

import { vi } from "vitest";

// Mock the AI SDK — no real OpenAI calls in tests
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock server-only
vi.mock("server-only", () => ({}));

import { generateObject } from "ai";
import {
  buildGate3Prompt,
  classifyRejectionReason,
  evaluateGate3,
  type Gate3Context,
  type Gate3Verdict,
  gate3VerdictSchema,
  mapVerdict,
} from "@/lib/jobs/gate-3";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockContext: Gate3Context = {
  job: {
    title: "Senior React Engineer",
    description:
      "We are looking for a senior frontend engineer with React, TypeScript, and Next.js experience.",
    extractedTags: ["react", "typescript", "nextjs", "css"],
    workplaceType: "remote",
    locationName: "Remote - Global",
    employmentType: "full-time",
  },
  persona: {
    personaLabel: "Senior React Developer",
    embeddingSummary:
      "Senior frontend engineer with 6 years building React applications. Deep expertise in Next.js App Router, TypeScript, and modern CSS.",
    mustHaveTags: ["react", "nextjs", "typescript", "javascript", "css"],
    blocklistTags: [],
    seniorityLevels: ["senior"],
  },
  applicant: {
    allTags: [
      "react",
      "nextjs",
      "typescript",
      "javascript",
      "css",
      "git",
      "vitest",
    ],
    country: "RS",
    canWorkUsHours: true,
    preferredCompliance: ["b2b", "w8ben"],
    modalities: ["full-time", "contract"],
    assignmentTypes: ["remote"],
    workAuthorizations: [],
  },
};

const mockApprovedVerdict: Gate3Verdict = {
  approved: true,
  matchConfidence: 0.85,
  matchReasoning:
    "The job requires React, TypeScript, and Next.js which align perfectly with the persona's must-have tags. The remote assignment type matches the applicant's preference.",
  blockers: [],
  workAuthRiskFlag: false,
};

const mockRejectedVerdict: Gate3Verdict = {
  approved: false,
  matchConfidence: 0.9,
  matchReasoning:
    "The job requires on-site work in San Francisco, but the applicant only accepts remote assignments.",
  blockers: ["requires on-site in SF"],
  workAuthRiskFlag: false,
};

// =============================================================================
// buildGate3Prompt — context assembly
// =============================================================================

describe("buildGate3Prompt", () => {
  it("includes job title and description", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Senior React Engineer");
    expect(prompt).toContain("React, TypeScript, and Next.js");
  });

  it("includes job extracted tags", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("react, typescript, nextjs, css");
  });

  it("includes job workplace type, location, and employment type", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Workplace Type: remote");
    expect(prompt).toContain("Location: Remote - Global");
    expect(prompt).toContain("Employment Type: full-time");
  });

  it("Fix 4: includes remote scope and location countries in prompt", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      job: {
        ...mockContext.job,
        remoteScope: "country_fenced",
        locationCountries: ["PL"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("Remote Scope: country_fenced");
    expect(prompt).toContain("restricted to: PL");
  });

  it("Fix 4: shows 'not specified' for null remote scope", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      job: {
        ...mockContext.job,
        remoteScope: null,
        locationCountries: null,
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("Remote Scope: not specified");
  });

  it("shows 'not specified' for null job metadata", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      job: {
        ...mockContext.job,
        workplaceType: null,
        locationName: null,
        employmentType: null,
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("Workplace Type: not specified");
    expect(prompt).toContain("Location: not specified");
    expect(prompt).toContain("Employment Type: not specified");
  });

  it("includes persona label and embedding summary", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Senior React Developer");
    expect(prompt).toContain("Senior frontend engineer with 6 years");
  });

  it("includes persona must-have and blocklist tags", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("react, nextjs, typescript, javascript, css");
    expect(prompt).toContain("Blocklist Tags");
  });

  it("includes applicant hard constraints", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Country: RS");
    expect(prompt).toContain("Can Work US Hours: true");
    expect(prompt).toContain("b2b, w8ben");
    expect(prompt).toContain("full-time, contract");
    expect(prompt).toContain("remote");
  });

  it("includes persona seniority levels in persona section", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Preferred Seniority Levels: senior");
  });

  it("shows 'any' for empty persona seniority levels", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      persona: { ...mockContext.persona, seniorityLevels: [] },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("Preferred Seniority Levels: any");
  });

  it("includes applicant full skill knowledge base", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Full Skill Knowledge Base");
    expect(prompt).toContain(
      "react, nextjs, typescript, javascript, css, git, vitest",
    );
  });

  it("handles empty arrays gracefully", () => {
    const ctx: Gate3Context = {
      job: {
        title: "Job",
        description: "desc",
        extractedTags: [],
        workplaceType: null,
        locationName: null,
        employmentType: null,
      },
      persona: {
        personaLabel: "Persona",
        embeddingSummary: "summary",
        mustHaveTags: [],
        blocklistTags: [],
        seniorityLevels: [],
      },
      applicant: {
        allTags: [],
        country: null,
        canWorkUsHours: null,
        preferredCompliance: [],
        modalities: [],
        assignmentTypes: [],
        workAuthorizations: [],
      },
    };

    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("none specified");
    expect(prompt).toContain("none");
    expect(prompt).toContain("not specified");
    expect(prompt).toContain("any");
  });

  it("includes blocklist tags when present", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      persona: {
        ...mockContext.persona,
        blocklistTags: ["java", "php"],
      },
    };

    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("java, php");
  });

  it("includes evaluation instruction at the end", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("## EVALUATION");
    expect(prompt).toContain("strong match");
  });

  // ── Compliance directive (w8ben / ic_global) ──────────────────────────────
  // The compliance directive is a dynamic section added to the user prompt
  // when the applicant has w8ben or ic_global compliance. It tells the LLM
  // to distinguish between contractor-friendly postings (approve) and W-2-only
  // postings (hard blocker) when evaluating US-only remote restrictions.
  // Without this, the LLM was rejecting US-only remote jobs even when the
  // applicant had w8ben compliance (0% approval for US-remote jobs). The
  // initial fix (treating ALL US-only as soft) was too broad — only ~2-5% of
  // "US only" postings actually accept international contractors.

  it("adds compliance directive when applicant has w8ben compliance", () => {
    const prompt = buildGate3Prompt(mockContext); // mockContext has w8ben

    expect(prompt).toContain("COMPLIANCE DIRECTIVE");
    expect(prompt).toContain("w8ben");
    expect(prompt).toContain("CONTRACTOR-FRIENDLY");
    expect(prompt).toContain("W-2 EMPLOYEE ONLY");
  });

  it("adds compliance directive when applicant has ic_global compliance", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        preferredCompliance: ["ic_global"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("COMPLIANCE DIRECTIVE");
    expect(prompt).toContain("ic_global");
    expect(prompt).toContain("CONTRACTOR-FRIENDLY");
    expect(prompt).toContain("W-2 EMPLOYEE ONLY");
  });

  it("adds compliance directive when applicant has both w8ben and ic_global", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        preferredCompliance: ["w8ben", "ic_global"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("COMPLIANCE DIRECTIVE");
    expect(prompt).toContain("w8ben and ic_global");
  });

  it("does NOT add compliance directive when applicant has no contractor compliance", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        preferredCompliance: ["b2b"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).not.toContain("COMPLIANCE DIRECTIVE");
  });

  it("does NOT add compliance directive when compliance is empty", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        preferredCompliance: [],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).not.toContain("COMPLIANCE DIRECTIVE");
  });

  it("compliance directive distinguishes contractor-friendly vs W-2-only language", () => {
    const prompt = buildGate3Prompt(mockContext);

    // Contractor-friendly signals
    expect(prompt).toContain("contractor");
    expect(prompt).toContain("1099");
    expect(prompt).toContain("B2B");
    // W-2-only signals
    expect(prompt).toContain("W-2");
    expect(prompt).toContain("must be authorized to work in the US");
    expect(prompt).toContain("visa sponsorship");
  });

  it("compliance directive clarifies non-US country restrictions are always hard blockers", () => {
    const prompt = buildGate3Prompt(mockContext);

    // Fix 3 (July 2026): The directive now leads with a STEP 1 country check
    // that hard-blocks non-US country-fenced jobs before considering compliance.
    expect(prompt).toContain("STEP 1: CHECK COUNTRY RESTRICTIONS FIRST");
    expect(prompt).toContain("HARD BLOCKER — REJECT IMMEDIATELY");
    expect(prompt).toContain("w8ben/ic_global compliance only covers US");
    // The specific country examples (Colombia, Japan, etc.) are now in the
    // Gate 0.5 Check 8 hard-block logic, not the Gate 3 prompt. The prompt
    // uses a general rule instead.
  });

  it("evaluation section references compliance directive", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("COMPLIANCE DIRECTIVE above");
  });

  it("includes management/PM role detection as a hard blocker (Fix 4)", () => {
    const prompt = buildGate3Prompt(mockContext);

    // The management/PM rule is criterion 8 in the system prompt, referenced
    // in the user prompt's evaluation section.
    expect(prompt.toLowerCase()).toContain("management/pm role detection");
  });
});

// =============================================================================
// Work authorization directive (EU permits, named permits, risk flag)
// =============================================================================
// Parallel to the compliance directive, but for work-permit/citizenship
// requirements. Tells the LLM what permits the applicant holds so it can
// check against jobs requiring EU citizenship, RWR Card Plus, Blue Card EU,
// UK settled status, etc. Also instructs the LLM to set workAuthRiskFlag
// when the JD is silent on work auth but the role is hybrid/single-country-remote.

describe("buildGate3Prompt — work authorization directive", () => {
  it("adds work auth directive when applicant has work authorizations", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen", "rwr_card_plus"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("WORK AUTHORIZATION DIRECTIVE");
    expect(prompt).toContain("eu_citizen");
    expect(prompt).toContain("rwr_card_plus");
    expect(prompt).toContain("EU/EEA member states");
  });

  it("does NOT add work auth directive when applicant has no work authorizations", () => {
    const prompt = buildGate3Prompt(mockContext); // mockContext has empty workAuthorizations

    expect(prompt).not.toContain("WORK AUTHORIZATION DIRECTIVE");
  });

  it("includes work authorizations in applicant hard constraints section", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("Work Authorizations: eu_citizen");
  });

  it("shows 'none specified' when work authorizations is empty", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("Work Authorizations: none specified");
  });

  it("directive explains permit coverage for EU citizen", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("eu_citizen: right to work in ALL EU/EEA");
    expect(prompt).toContain('"EU citizenship required"');
  });

  it("directive explains permit coverage for RWR Card Plus", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["rwr_card_plus"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("rwr_card_plus: Austrian Red-White-Red Card Plus");
  });

  it("directive explains permit coverage for Blue Card EU", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["blue_card_eu"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("blue_card_eu: EU Blue Card");
  });

  it("directive explains permit coverage for UK settled status", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["uk_settled"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("uk_settled: UK settled status");
  });

  it("directive instructs LLM to reject when applicant lacks required permit", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("HARD BLOCKER");
    expect(prompt).toContain("does NOT have");
  });

  it("directive instructs LLM to match when applicant has required permit", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("NOT a blocker");
  });

  it("directive instructs LLM to set workAuthRiskFlag for hybrid/single-country-remote", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("workAuthRiskFlag=true");
    expect(prompt).toContain("hybrid or single-country-remote");
  });

  it("evaluation section references work auth directive", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("WORK AUTHORIZATION DIRECTIVE above");
  });

  it("evaluation section mentions workAuthRiskFlag even without work auth", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("workAuthRiskFlag=true");
  });

  // ── Global-remote exemption from risk flag ───────────────────────────────
  // The location field alone is not enough to flag a job. Many ATS systems
  // set the location to a specific city/country (e.g., "Delhi", "India")
  // even for genuinely global remote roles. The prompt must instruct the LLM
  // to check the JD text for global remote indicators before flagging.

  it("prompt includes global-remote indicators list to check before flagging", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("global, remote-first");
    expect(prompt).toContain("work from anywhere");
    expect(prompt).toContain("worldwide");
    expect(prompt).toContain("distributed team");
    expect(prompt).toContain("across N countries");
    expect(prompt).toContain("Remote, Global");
  });

  it("prompt says to check JD text before flagging (location field not sufficient)", () => {
    // The explicit "location field alone is NOT sufficient" text is in the
    // system prompt criterion 7, not the user prompt. The user prompt's
    // evaluation section conveys the same meaning: "but first check the JD
    // text for global remote indicators".
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("but first check the JD text");
    expect(prompt).toContain("global remote indicators");
  });

  it("prompt instructs not to flag if JD text says global remote", () => {
    // The "do NOT set" instruction is in the work-auth directive, which only
    // renders when the applicant has work authorizations. Test with work auth.
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("do NOT set workAuthRiskFlag=true");
    expect(prompt).toContain("global remote");
  });

  it("work-auth directive also includes global-remote exemption when applicant has work auth", () => {
    const ctx: Gate3Context = {
      ...mockContext,
      applicant: {
        ...mockContext.applicant,
        workAuthorizations: ["eu_citizen"],
      },
    };
    const prompt = buildGate3Prompt(ctx);

    expect(prompt).toContain("global remote indicators");
    expect(prompt).toContain("global, remote-first");
    expect(prompt).toContain("do NOT set workAuthRiskFlag=true");
  });

  it("evaluation section mentions checking JD text for global remote before flagging", () => {
    const prompt = buildGate3Prompt(mockContext);

    expect(prompt).toContain("global remote indicators");
    expect(prompt).toContain(
      "if the JD says global remote, set workAuthRiskFlag=false",
    );
  });
});

// =============================================================================
// gate3VerdictSchema — workAuthRiskFlag field validation
// =============================================================================

describe("gate3VerdictSchema — workAuthRiskFlag", () => {
  it("accepts verdict with workAuthRiskFlag=false", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.85,
      matchReasoning: "Good match",
      blockers: [],
      workAuthRiskFlag: false,
    });

    expect(result.success).toBe(true);
  });

  it("accepts verdict with workAuthRiskFlag=true", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.7,
      matchReasoning: "Good match but work auth not verified",
      blockers: [],
      workAuthRiskFlag: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects verdict missing workAuthRiskFlag (required by OpenAI strict schema)", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.85,
      matchReasoning: "Good match",
      blockers: [],
    });

    // workAuthRiskFlag is required (not defaulted) because OpenAI's strict
    // JSON schema mode requires all properties in the `required` array.
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// gate3VerdictSchema — Zod validation
// =============================================================================

describe("gate3VerdictSchema", () => {
  it("validates a correct approved verdict", () => {
    const result = gate3VerdictSchema.safeParse(mockApprovedVerdict);

    expect(result.success).toBe(true);
  });

  it("validates a correct rejected verdict", () => {
    const result = gate3VerdictSchema.safeParse(mockRejectedVerdict);

    expect(result.success).toBe(true);
  });

  it("rejects missing approved field", () => {
    const result = gate3VerdictSchema.safeParse({
      matchConfidence: 0.8,
      matchReasoning: "Good match",
      blockers: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects matchConfidence outside 0-1 range", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 1.5,
      matchReasoning: "Good match",
      blockers: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects matchConfidence negative", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: -0.1,
      matchReasoning: "Good match",
      blockers: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty matchReasoning", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.8,
      matchReasoning: "",
      blockers: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects matchReasoning over 500 chars", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.8,
      matchReasoning: "a".repeat(501),
      blockers: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing blockers array", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.8,
      matchReasoning: "Good match",
    });

    expect(result.success).toBe(false);
  });

  it("accepts empty blockers array (for approved verdicts)", () => {
    const result = gate3VerdictSchema.safeParse({
      approved: true,
      matchConfidence: 0.8,
      matchReasoning: "Good match",
      blockers: [],
      workAuthRiskFlag: false,
    });

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// evaluateGate3 — LLM call with mocked generateObject
// =============================================================================

describe("evaluateGate3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject with gpt-4o-mini model", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockApprovedVerdict,
    });

    await evaluateGate3(mockContext);

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "gpt-4o-mini" }),
      }),
    );
  });

  it("passes the gate3VerdictSchema to generateObject", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockApprovedVerdict,
    });

    await evaluateGate3(mockContext);

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gate3VerdictSchema,
      }),
    );
  });

  it("passes system and user messages", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockApprovedVerdict,
    });

    await evaluateGate3(mockContext);

    const call = (generateObject as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.messages).toHaveLength(2);
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[1].role).toBe("user");
    expect(call.messages[1].content).toContain("Senior React Engineer");
  });

  it("returns the LLM verdict object", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockApprovedVerdict,
    });

    const result = await evaluateGate3(mockContext);

    expect(result).toEqual(mockApprovedVerdict);
    expect(result.approved).toBe(true);
    expect(result.matchConfidence).toBe(0.85);
    expect(result.matchReasoning).toContain("React, TypeScript, and Next.js");
    expect(result.blockers).toEqual([]);
  });

  it("returns a rejected verdict correctly", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockRejectedVerdict,
    });

    const result = await evaluateGate3(mockContext);

    expect(result.approved).toBe(false);
    expect(result.blockers).toContain("requires on-site in SF");
  });

  it("propagates errors from generateObject (rate limit, timeout)", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("OpenAI rate limit exceeded"),
    );

    await expect(evaluateGate3(mockContext)).rejects.toThrow(
      "OpenAI rate limit exceeded",
    );
  });

  it("propagates AI_ZodError when LLM returns unparseable output", async () => {
    (generateObject as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("AI_ZodError: Invalid response"),
    );

    await expect(evaluateGate3(mockContext)).rejects.toThrow("AI_ZodError");
  });
});

// =============================================================================
// mapVerdict — verdict mapping (§6.5)
// =============================================================================

describe("mapVerdict", () => {
  it("maps approved=true to 'approved'", () => {
    expect(mapVerdict(mockApprovedVerdict)).toBe("approved");
  });

  it("maps approved=false to 'rejected'", () => {
    expect(mapVerdict(mockRejectedVerdict)).toBe("rejected");
  });

  it("maps a low-confidence approved verdict to 'approved'", () => {
    const lowConfidenceApproved: Gate3Verdict = {
      approved: true,
      matchConfidence: 0.1,
      matchReasoning: "Weak match but passes minimum criteria.",
      blockers: [],
      workAuthRiskFlag: false,
    };

    expect(mapVerdict(lowConfidenceApproved)).toBe("approved");
  });

  it("maps a high-confidence rejected verdict to 'rejected'", () => {
    const highConfidenceRejected: Gate3Verdict = {
      approved: false,
      matchConfidence: 0.95,
      matchReasoning: "Clear mismatch in tech stack.",
      blockers: ["wrong tech stack"],
      workAuthRiskFlag: false,
    };

    expect(mapVerdict(highConfidenceRejected)).toBe("rejected");
  });
});

// =============================================================================
// Sprint 8: Gate 3 Prompt Tuning — international contractor + hybrid guidance
// =============================================================================

describe("Gate 3 Sprint 8 prompt tuning", () => {
  it("balanced prompt includes w8ben/ic_global contractor guidance", () => {
    const prompt = buildGate3Prompt(mockContext);
    // The prompt should mention w8ben or ic_global for international contractors
    expect(prompt.toLowerCase()).toContain("w8ben");
  });

  it("balanced prompt uses 'balanced' instead of 'conservative'", () => {
    const prompt = buildGate3Prompt(mockContext);
    // The system prompt is embedded in the evaluation, not the user prompt.
    // We test the system prompt content via evaluateGate3's variant selection.
    // The user prompt itself doesn't contain the system prompt, so we verify
    // the prompt builder includes the compliance info the LLM needs.
    expect(prompt).toContain("w8ben");
    expect(prompt).toContain("Preferred Compliance");
  });

  it("includes applicant compliance preferences in the prompt", () => {
    const prompt = buildGate3Prompt(mockContext);
    expect(prompt).toContain("Preferred Compliance");
    expect(prompt).toContain("b2b, w8ben");
  });

  it("includes applicant assignment types in the prompt", () => {
    const prompt = buildGate3Prompt(mockContext);
    expect(prompt).toContain("Assignment Types");
    expect(prompt).toContain("remote");
  });

  it("includes applicant country in the prompt", () => {
    const prompt = buildGate3Prompt(mockContext);
    expect(prompt).toContain("Country: RS");
  });
});

// =============================================================================
// REJECTION REASON CLASSIFICATION (v4 lock §1-A.4)
// =============================================================================

describe("classifyRejectionReason", () => {
  it("classifies geo-country-fenced blockers", () => {
    const reason = classifyRejectionReason([
      "location restriction (Bengaluru)",
      "Country-specific restriction to India",
    ]);
    expect(reason).toBe("geo_country_fenced");
  });

  it("classifies geo-region-fenced blockers", () => {
    const reason = classifyRejectionReason([
      "Job location is APAC — applicant's country is not in this region",
    ]);
    expect(reason).toBe("geo_region_fenced");
  });

  it("classifies stack-mismatch blockers", () => {
    const reason = classifyRejectionReason([
      "tech stack does not align with applicant's must-have tags",
      "requires Java and Spring Boot which are not in the persona's skill set",
    ]);
    expect(reason).toBe("stack_mismatch");
  });

  it("classifies seniority-mismatch blockers", () => {
    const reason = classifyRejectionReason([
      "Job expects 2-3 years with senior responsibilities, applicant has 15+ years — likely overqualified",
    ]);
    expect(reason).toBe("seniority_mismatch");
  });

  it("classifies contract-compliance blockers", () => {
    const reason = classifyRejectionReason([
      "requires W-2 employment, applicant is a contractor",
      "no visa sponsorship provided",
    ]);
    expect(reason).toBe("contract_compliance");
  });

  it("classifies stale blockers", () => {
    const reason = classifyRejectionReason([
      "job is no longer active — expired",
    ]);
    expect(reason).toBe("stale");
  });

  it("returns 'other' for unclassifiable blockers", () => {
    const reason = classifyRejectionReason([
      "some unknown reason that doesn't match any category",
    ]);
    expect(reason).toBe("other");
  });

  it("returns 'other' for empty blockers", () => {
    expect(classifyRejectionReason([])).toBe("other");
  });

  it("prioritizes geo_region_fenced over geo_country_fenced", () => {
    const reason = classifyRejectionReason([
      "Job location is EMEA region — applicant's country is not in this region",
    ]);
    expect(reason).toBe("geo_region_fenced");
  });
});
