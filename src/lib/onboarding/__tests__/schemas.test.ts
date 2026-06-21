/**
 * Unit tests for the Module A Zod schemas (Schema 1 + Schema 2) and the
 * pre-LLM CV validity check.
 *
 * Covers the test plan from MODULE_A_IMPLEMENTATION_HANDOFF.md §10:
 *   - resumeExtractionSchema accepts/rejects various extractions
 *   - onboardingPayloadSchema accepts/rejects various payloads
 *   - validateCvRawText pre-LLM guard
 */

import {
  onboardingPayloadSchema,
  resumeExtractionSchema,
  validateCvDomain,
  validateCvRawText,
} from "@/lib/onboarding/schemas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A minimal valid Schema 1 role entry. */
const validRole = {
  company: "Acme Corp",
  title: "Senior React Developer",
  start_date: "2020-01",
  end_date: "2024-06",
  is_current: false,
  summary: "Built React apps.",
  canonical_skills_detected: ["react", "typescript", "nextjs"],
  raw_skills_detected: ["React", "TypeScript", "Next.js"],
};

/** A minimal valid Schema 1 proposed stack. */
const validStack = {
  anchor_tag: "react",
  persona_label: "Senior React Developer",
  persona_id: "react_frontend",
  must_have_tags: ["react", "typescript", "nextjs", "javascript", "css"],
  embedding_summary:
    "Senior React developer with 8 years building production SaaS apps. Strong in TypeScript and Next.js. Prefers full-stack roles in fintech.",
};

/** A minimal valid Schema 1 extraction (1 role + 1 stack). */
const validExtraction = {
  roles: [validRole],
  canonical_skills_detected: ["react", "typescript", "nextjs"],
  raw_skills_detected: ["React", "TypeScript", "Next.js"],
  proposed_stacks: [validStack],
};

/** A minimal valid Schema 2 work history entry. */
const validWorkHistoryEntry = {
  company: "Acme Corp",
  role: "Senior React Developer",
  startDate: "2020-01",
  endDate: "2024-06",
  isCurrent: false,
  summary: "Built React apps.",
  canonicalSkillsDetected: ["react", "typescript", "nextjs"],
  rawSkillsDetected: ["React", "TypeScript", "Next.js"],
};

/** A minimal valid Schema 2 persona. */
const validPersona = {
  personaId: "react_frontend",
  personaLabel: "Senior React Developer",
  embeddingSummary:
    "Senior React developer with 8 years building production SaaS apps. Strong in TypeScript and Next.js. Prefers full-stack roles in fintech.",
  mustHaveTags: ["react", "typescript", "nextjs", "javascript", "css"],
  blocklistTags: [],
};

/** A minimal valid Schema 2 payload. */
const validPayload = {
  country: "RS",
  canWorkUsHours: true,
  assignmentTypes: ["remote"],
  modalities: ["full-time"],
  preferredCompliance: ["b2b"],
  cvUploadId: "550e8400-e29b-41d4-a716-446655440000",
  workHistory: [validWorkHistoryEntry],
  personas: [validPersona],
};

// ─── resumeExtractionSchema ───────────────────────────────────────────────────

describe("resumeExtractionSchema", () => {
  it("accepts a valid extraction with 1 role + 1 stack", () => {
    const result = resumeExtractionSchema.safeParse(validExtraction);
    expect(result.success).toBe(true);
  });

  it("rejects 0 roles", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      roles: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a proposed_stack with 0 persona_defining tags", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      proposed_stacks: [
        {
          ...validStack,
          must_have_tags: ["css", "html", "sass", "bootstrap", "jquery"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 3 canonical_skills_detected", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      canonical_skills_detected: ["react", "typescript"],
      roles: [
        {
          ...validRole,
          canonical_skills_detected: ["react", "typescript"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // Layer 2 domain gate (MODULE_A_DECISIONS.md §13): ≥1 persona_defining tag
  // in canonical_skills_detected. Catches adjacent-but-out-of-scope roles
  // (web designers, QA analysts) who pass ≥3 canonical skills with only
  // supporting tags.
  it("rejects 3 canonical skills with 0 persona_defining tags (Layer 2 domain gate)", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      canonical_skills_detected: ["html", "css", "git"],
      roles: [
        {
          ...validRole,
          canonical_skills_detected: ["html", "css", "git"],
        },
      ],
      // Stack also has no persona_defining tag — but the Layer 2 check
      // catches it on canonical_skills_detected first
      proposed_stacks: [
        {
          ...validStack,
          anchor_tag: "css",
          must_have_tags: ["html", "css", "git", "sass", "bootstrap"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts 3 canonical skills with 1 persona_defining tag (Layer 2 domain gate)", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      canonical_skills_detected: ["react", "html", "css"],
      roles: [
        {
          ...validRole,
          canonical_skills_detected: ["react", "html", "css"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 2 proposed_stacks", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      proposed_stacks: [
        validStack,
        { ...validStack, persona_id: "backend_go", anchor_tag: "go" },
        { ...validStack, persona_id: "third", anchor_tag: "python" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stack with != 5 must_have_tags", () => {
    const result = resumeExtractionSchema.safeParse({
      ...validExtraction,
      proposed_stacks: [
        { ...validStack, must_have_tags: ["react", "typescript"] },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ─── onboardingPayloadSchema ──────────────────────────────────────────────────

describe("onboardingPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = onboardingPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects missing country", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      country: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 1-character country (not alpha-2)", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      country: "R",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty assignmentTypes array", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      assignmentTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty modalities array", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      modalities: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty preferredCompliance array", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      preferredCompliance: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a persona with 4 mustHaveTags (not 5)", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      personas: [
        {
          ...validPersona,
          mustHaveTags: ["react", "typescript", "nextjs", "css"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a persona with no persona_defining tag in mustHaveTags", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      personas: [
        {
          ...validPersona,
          mustHaveTags: ["css", "html", "sass", "bootstrap", "jquery"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 personas", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      personas: [
        validPersona,
        { ...validPersona, personaId: "p2" },
        { ...validPersona, personaId: "p3" },
        { ...validPersona, personaId: "p4" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid cvUploadId (not a UUID)", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      cvUploadId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty workHistory", () => {
    const result = onboardingPayloadSchema.safeParse({
      ...validPayload,
      workHistory: [],
    });
    expect(result.success).toBe(false);
  });

  it("applies the blocklistTags default when omitted", () => {
    const payloadWithoutBlocklist = {
      ...validPayload,
      personas: [{ ...validPersona, blocklistTags: undefined }],
    };
    const result = onboardingPayloadSchema.safeParse(payloadWithoutBlocklist);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.personas[0].blocklistTags).toEqual([]);
    }
  });
});

// ─── validateCvRawText ────────────────────────────────────────────────────────

describe("validateCvRawText", () => {
  it("rejects text shorter than 200 characters", () => {
    const shortText = "John Doe\nSoftware Engineer\n2020-2024";
    expect(validateCvRawText(shortText)).not.toBeNull();
  });

  it("rejects text with no year patterns", () => {
    const noYearText =
      "This is a long enough text that exceeds the two hundred character minimum threshold " +
      "but it does not contain any four digit year patterns that would indicate employment " +
      "dates are present anywhere in the document so it should be rejected by the validator.";
    expect(validateCvRawText(noYearText)).not.toBeNull();
  });

  it("accepts valid CV text (>= 200 chars + year pattern)", () => {
    const validText =
      "John Doe — Software Engineer\n\n" +
      "Experience:\n" +
      "Acme Corp — Senior React Developer (2020-2024)\n" +
      "Built and maintained React applications using TypeScript and Next.js.\n" +
      "Tech Corp — Frontend Developer (2018-2020)\n" +
      "Developed Vue.js dashboards and component libraries.\n" +
      "Skills: React, TypeScript, Next.js, Vue, JavaScript, CSS, HTML.";
    expect(validateCvRawText(validText)).toBeNull();
  });
});

// ─── validateCvDomain (Layer 1 pre-LLM domain gate) ──────────────────────────

describe("validateCvDomain", () => {
  it("rejects a non-technical CV with zero dev markers", () => {
    const nonDevText =
      "Jane Smith — Marketing Manager\n\n" +
      "Experience:\n" +
      "Acme Corp — Marketing Manager (2020-2024)\n" +
      "Led brand strategy and managed a team of 5 marketing specialists.\n" +
      "Developed go-to-market strategies for 3 product launches.\n" +
      "Tech Corp — Marketing Associate (2018-2020)\n" +
      "Coordinated social media campaigns and email newsletters.\n" +
      "Education: MBA, Harvard Business School (2016-2018).";
    expect(validateCvDomain(nonDevText)).not.toBeNull();
  });

  it("rejects a business consultant CV (contains 'go' but not as a dev marker)", () => {
    const consultantText =
      "John Smith — Senior Business Consultant\n\n" +
      "Experience:\n" +
      "McKinsey & Company — Senior Consultant (2020-2024)\n" +
      "Advised Fortune 500 clients on go-to-market strategy and operational excellence.\n" +
      "Led due diligence teams for 3 M&A transactions worth over $500M.\n" +
      "Bain & Company — Associate Consultant (2018-2020)\n" +
      "Conducted market research and financial modeling for private equity clients.\n" +
      "Education: MBA, Stanford Graduate School of Business (2016-2018).";
    // "go" in "go-to-market" should NOT match because "Go" is in the
    // ambiguous labels exclusion list. No other dev markers present.
    expect(validateCvDomain(consultantText)).not.toBeNull();
  });

  it("accepts a developer CV with explicit tech markers", () => {
    const devText =
      "John Doe — Software Engineer\n\n" +
      "Experience:\n" +
      "Acme Corp — Senior React Developer (2020-2024)\n" +
      "Built and maintained React applications using TypeScript and Next.js.\n" +
      "Tech Corp — Frontend Developer (2018-2020)\n" +
      "Developed Vue.js dashboards and component libraries.\n" +
      "Skills: React, TypeScript, Next.js, Vue, JavaScript, CSS, HTML.";
    expect(validateCvDomain(devText)).toBeNull();
  });

  it("accepts a CV that only mentions a supplemental marker (github)", () => {
    const githubText =
      "Jane Doe — Open Source Contributor\n\n" +
      "Experience:\n" +
      "Self-employed — Freelance Developer (2020-2024)\n" +
      "Maintained several open source projects on GitHub with over 10k stars.\n" +
      "Contributed to various open source initiatives and reviewed pull requests.\n" +
      "Education: B.Sc. in Computer Science, MIT (2016-2020).";
    expect(validateCvDomain(githubText)).toBeNull();
  });

  it("accepts a CV that mentions a programming language by name (Python)", () => {
    const pythonText =
      "Jane Smith — Data Analyst\n\n" +
      "Experience:\n" +
      "Data Corp — Data Analyst (2020-2024)\n" +
      "Built data pipelines and dashboards using Python and SQL.\n" +
      "Automated reporting workflows and improved data quality.\n" +
      "Education: B.Sc. in Statistics, UC Berkeley (2016-2020).";
    expect(validateCvDomain(pythonText)).toBeNull();
  });

  it("does not false-match 'go' inside 'going' (word-boundary regex)", () => {
    const textWithGoing =
      "John Smith — Project Manager\n\n" +
      "Experience:\n" +
      "Acme Corp — Project Manager (2020-2024)\n" +
      "Responsible for going through project requirements and delivering on time.\n" +
      "Managed cross-functional teams and ensured stakeholder alignment.\n" +
      "Education: B.A. in Business Administration, State University (2016-2020).";
    // "going" should not match the "Go" marker (which is excluded anyway),
    // but this test also verifies the word-boundary regex works correctly.
    expect(validateCvDomain(textWithGoing)).not.toBeNull();
  });

  it("accepts a CV mentioning C# (label with non-word char suffix)", () => {
    const csharpText =
      "Jane Doe — Backend Developer\n\n" +
      "Experience:\n" +
      "Acme Corp — Senior Backend Developer (2020-2024)\n" +
      "Built REST APIs using C# and ASP.NET. Managed SQL Server databases.\n" +
      "Tech Corp — Software Developer (2018-2020)\n" +
      "Developed internal tools using C# and the .NET framework.\n" +
      "Education: B.Sc. in Computer Science, University of Washington (2014-2018).";
    expect(validateCvDomain(csharpText)).toBeNull();
  });

  it("accepts a CV mentioning C++ (label with non-word char suffix)", () => {
    const cppText =
      "Jane Doe — Systems Engineer\n\n" +
      "Experience:\n" +
      "Acme Corp — Systems Engineer (2020-2024)\n" +
      "Built high-performance trading systems using C++ and Boost.\n" +
      "Optimized latency-critical code paths and reduced memory fragmentation.\n" +
      "Education: B.Sc. in Computer Engineering, Georgia Tech (2016-2020).";
    expect(validateCvDomain(cppText)).toBeNull();
  });

  it("accepts a CV mentioning Next.js (label with dot in middle)", () => {
    const nextjsText =
      "Jane Doe — Frontend Developer\n\n" +
      "Experience:\n" +
      "Acme Corp — Frontend Developer (2020-2024)\n" +
      "Built server-rendered web applications using Next.js and React.\n" +
      "Implemented responsive designs and optimized Core Web Vitals.\n" +
      "Education: B.Sc. in Web Development, Full Sail University (2016-2020).";
    expect(validateCvDomain(nextjsText)).toBeNull();
  });
});
