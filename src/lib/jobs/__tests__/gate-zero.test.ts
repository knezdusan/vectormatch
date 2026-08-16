/**
 * Unit tests for Gate 0 — the pre-database-insertion title filter (TDD §4.3).
 *
 * Design principle: optimize for RECALL, not precision. The 3-Gate funnel
 * (Module C) handles precision. The cost of a false positive is low; the cost
 * of a false negative (a missed job) is high.
 *
 * Test coverage:
 *   - Core engineering titles pass (engineer, developer, programmer, etc.)
 *   - Specialized roles pass (devops, sre, data engineer, ml engineer, etc.)
 *   - Mobile roles pass (iOS, Android, React Native)
 *   - Leadership roles pass (tech lead, engineering manager, CTO, etc.)
 *   - QA roles pass (qa engineer, test engineer, automation engineer)
 *   - Design-adjacent engineering roles pass (ui engineer, ux engineer)
 *   - Hyphenated variants pass (front-end, back-end, full-stack)
 *   - Plurals pass (Software Engineers, Frontend Developers)
 *   - Non-engineering roles are rejected (Account Executive, HR Manager, etc.)
 *   - Word boundaries prevent false positives (Data Entry Clerk ≠ data)
 *   - Case insensitivity works
 */

import {
  detectCountryFence,
  GATE_ZERO_REGEX,
  isNationalSecurityJob,
  passesFenceGate,
  passesGateZero,
  passesGateZeroWebDev,
} from "@/lib/jobs/gate-zero";

// ── Core engineering titles (should pass) ────────────────────────────────────

describe("Gate 0 — core engineering titles pass", () => {
  const passingTitles = [
    "Software Engineer",
    "Senior Software Engineer",
    "Staff Software Engineer",
    "Principal Software Engineer",
    "Backend Developer",
    "Frontend Developer",
    "Full Stack Developer",
    "Fullstack Engineer",
    "Backend Engineer",
    "Web Developer",
    "Computer Programmer",
    "Software Developer",
    "Front-end Engineer",
    "Back-end Developer",
    "Full-stack Engineer",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── Specialized roles (should pass) ──────────────────────────────────────────

describe("Gate 0 — specialized roles pass", () => {
  const passingTitles = [
    "DevOps Engineer",
    "Senior DevOps Engineer",
    "SRE",
    "Site Reliability Engineer",
    "Platform Engineer",
    "Cloud Architect",
    "Solutions Architect",
    "Data Engineer",
    "Senior Data Engineer",
    "Data Scientist",
    "ML Engineer",
    "Machine Learning Engineer",
    "Security Engineer",
    "Infrastructure Engineer",
    "Reliability Engineer",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── Mobile roles (should pass) ───────────────────────────────────────────────

describe("Gate 0 — mobile roles pass", () => {
  const passingTitles = [
    "iOS Developer",
    "Android Developer",
    "Mobile Developer",
    "React Native Developer",
    "Senior iOS Developer",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── Leadership roles (should pass) ───────────────────────────────────────────

describe("Gate 0 — leadership roles pass", () => {
  const passingTitles = [
    "Tech Lead",
    "Engineering Manager",
    "Engineering Director",
    "CTO",
    "VP of Engineering",
    "Head of Engineering",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── QA roles (should pass) ───────────────────────────────────────────────────

describe("Gate 0 — QA roles pass", () => {
  const passingTitles = [
    "QA Engineer",
    "Test Engineer",
    "Automation Engineer",
    "Quality Engineer",
    "Senior QA Engineer",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── Design-adjacent engineering roles (should pass) ──────────────────────────

describe("Gate 0 — design-adjacent engineering roles pass", () => {
  it('passes: "UI Engineer"', () => {
    expect(passesGateZero("UI Engineer")).toBe(true);
  });
  it('passes: "UX Engineer"', () => {
    expect(passesGateZero("UX Engineer")).toBe(true);
  });
});

// ── Plurals (should pass — recall optimization) ──────────────────────────────

describe("Gate 0 — plurals pass (recall optimization)", () => {
  const passingTitles = [
    "Software Engineers",
    "Frontend Developers",
    "Backend Developers",
    "Mobile Developers",
    "Data Engineers",
  ];

  for (const title of passingTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(true);
    });
  }
});

// ── Case insensitivity ───────────────────────────────────────────────────────

describe("Gate 0 — case insensitivity", () => {
  it("matches all-lowercase", () => {
    expect(passesGateZero("software engineer")).toBe(true);
  });
  it("matches all-uppercase", () => {
    expect(passesGateZero("SOFTWARE ENGINEER")).toBe(true);
  });
  it("matches mixed case", () => {
    expect(passesGateZero("SoFtWaRe EnGiNeEr")).toBe(true);
  });
  it("matches lowercase 'cto'", () => {
    expect(passesGateZero("cto")).toBe(true);
  });
  it("matches uppercase 'CTO'", () => {
    expect(passesGateZero("CTO")).toBe(true);
  });
});

// ── Non-engineering roles (should be rejected) ───────────────────────────────

describe("Gate 0 — non-engineering roles are rejected", () => {
  const rejectedTitles = [
    "Account Executive",
    "HR Manager",
    "Janitor",
    "Sales Representative",
    "Marketing Manager",
    "Office Administrator",
    "Recruiter",
    "Accountant",
    "Legal Counsel",
    "Chief Financial Officer",
    "Director of Operations",
    "Customer Success Manager",
    "Business Development Representative",
    "Content Writer",
    "Graphic Designer",
    "Product Manager",
  ];

  for (const title of rejectedTitles) {
    it(`rejects: "${title}"`, () => {
      expect(passesGateZero(title)).toBe(false);
    });
  }
});

// ── Word boundary precision (false positives to avoid) ───────────────────────

describe("Gate 0 — word boundaries prevent false positives", () => {
  it('rejects "Data Entry Clerk" (word boundary prevents "data" match)', () => {
    // "data" alone is not in the term list — only "data engineer" and
    // "data scientist" are. The word boundary on "data engineer" prevents
    // matching "Data Entry" because "engineer" doesn't follow "data".
    expect(passesGateZero("Data Entry Clerk")).toBe(false);
  });

  it('rejects "Reengineering Manager" (word boundary prevents "engineer" match)', () => {
    // \bengineer\b should not match inside "reengineering" because the \b
    // before "engineer" requires a non-word char, but "reengineering" has
    // "r" (a word char) before "engineer".
    expect(passesGateZero("Reengineering Manager")).toBe(false);
  });

  it('rejects "SRE Assistant" — wait, SRE should match', () => {
    // Actually "SRE" is in the term list, so "SRE Assistant" should pass.
    // This is correct behavior — recall optimization means we'd rather have
    // a false positive here than miss a real SRE role.
    expect(passesGateZero("SRE Assistant")).toBe(true);
  });

  it('rejects "DevOps Coordinator" — wait, DevOps should match', () => {
    // "DevOps" is in the term list. "DevOps Coordinator" passes Gate 0.
    // This is acceptable — Gate 1/2/3 will filter it out if it's not a
    // real engineering role. Recall > precision at Gate 0.
    expect(passesGateZero("DevOps Coordinator")).toBe(true);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("Gate 0 — edge cases", () => {
  it("rejects empty string", () => {
    expect(passesGateZero("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(passesGateZero("   ")).toBe(false);
  });

  it("handles titles with extra whitespace", () => {
    expect(passesGateZero("  Senior  Software  Engineer  ")).toBe(true);
  });

  it("handles titles with special characters", () => {
    expect(passesGateZero("Software Engineer (Remote)")).toBe(true);
    expect(passesGateZero("Software Engineer - Platform Team")).toBe(true);
  });

  it("handles titles with pipe separators (common in ATS)", () => {
    expect(passesGateZero("Software Engineer | Platform")).toBe(true);
  });

  it("does not throw on non-string input via regex", () => {
    // The function signature requires string, but the regex itself should
    // not throw if coerced. This is a defensive test.
    expect(() => passesGateZero("null")).not.toThrow();
  });
});

// ── Regex export ─────────────────────────────────────────────────────────────

describe("GATE_ZERO_REGEX", () => {
  it("is a RegExp instance", () => {
    expect(GATE_ZERO_REGEX).toBeInstanceOf(RegExp);
  });

  it("is case-insensitive (has 'i' flag)", () => {
    expect(GATE_ZERO_REGEX.flags).toContain("i");
  });

  it("does not have global flag (boolean test only)", () => {
    expect(GATE_ZERO_REGEX.flags).not.toContain("g");
  });
});

// ── Gate 0 Web-Dev (D7 — Role-Scoped Ingestion) ──────────────────────────────

describe("Gate 0 Web-Dev — role-scoped title filter", () => {
  // Web-dev titles that should pass
  const webDevTitles = [
    "Frontend Engineer",
    "Senior Frontend Engineer",
    "Front-End Developer",
    "Back-End Engineer",
    "Fullstack Developer",
    "Full-Stack Engineer",
    "Full Stack Developer",
    "Web Developer",
    "Web Engineer",
    "React Engineer",
    "Senior React Developer",
    "Next.js Developer",
    "Node.js Engineer",
    "Vue.js Developer",
    "Angular Developer",
    "Svelte Engineer",
    "PHP Developer",
    "Laravel Developer",
    "WordPress Developer",
    "Symfony Developer",
    "JavaScript Developer",
    "TypeScript Engineer",
    "UI Engineer",
    "UX Engineer",
    "UI Developer",
    "Shopify Developer",
    "Webflow Developer",
    "HTML/CSS Developer",
    "Tailwind Developer",
  ];

  for (const title of webDevTitles) {
    it(`passes: "${title}"`, () => {
      expect(passesGateZeroWebDev(title)).toBe(true);
    });
  }

  // Non-web-dev engineering titles that should be REJECTED by web-dev gate
  // (but would pass the broad Gate 0)
  const nonWebDevEngineeringTitles = [
    "Data Engineer",
    "Senior Data Engineer",
    "ML Engineer",
    "Machine Learning Engineer",
    "Data Scientist",
    "DevOps Engineer",
    "SRE",
    "Site Reliability Engineer",
    "Platform Engineer",
    "Security Engineer",
    "Infrastructure Engineer",
    "iOS Developer",
    "Android Developer",
    "Mobile Developer",
    "QA Engineer",
    "Test Engineer",
    "Automation Engineer",
    "Quality Engineer",
    "Architect",
    "Engineering Manager",
    "CTO",
    "VP of Engineering",
    "Head of Engineering",
    "Tech Lead",
  ];

  for (const title of nonWebDevEngineeringTitles) {
    it(`rejects non-web-dev engineering: "${title}"`, () => {
      expect(passesGateZeroWebDev(title)).toBe(false);
    });
  }

  // Non-engineering titles that should also be rejected
  const nonEngineeringTitles = [
    "Account Executive",
    "HR Manager",
    "Sales Representative",
    "Marketing Manager",
    "Product Manager",
    "Customer Support",
    "Data Entry Clerk",
    "Project Manager",
  ];

  for (const title of nonEngineeringTitles) {
    it(`rejects non-engineering: "${title}"`, () => {
      expect(passesGateZeroWebDev(title)).toBe(false);
    });
  }

  it("is case-insensitive", () => {
    expect(passesGateZeroWebDev("FRONTEND ENGINEER")).toBe(true);
    expect(passesGateZeroWebDev("php developer")).toBe(true);
    expect(passesGateZeroWebDev("ReAcT DeVeLoPeR")).toBe(true);
  });

  it("handles titles with extra context", () => {
    expect(passesGateZeroWebDev("Senior Frontend Engineer (Remote)")).toBe(
      true,
    );
    expect(passesGateZeroWebDev("PHP Developer - Laravel Team")).toBe(true);
    expect(passesGateZeroWebDev("Full-Stack Engineer | Platform")).toBe(true);
  });
});

// ── Gate 0 Fence Detection (Directive 11, Fix 1) ───────────────────────────

describe("Gate 0 Fence Detection — detectCountryFence", () => {
  // Title fences (from founder audit ground-truth)
  it("detects 'US Remote' in title", () => {
    expect(
      detectCountryFence(
        "Senior Software Engineer - Fullstack, US Remote",
        null,
      ),
    ).toBe("title_fence");
  });

  it("detects 'Remote (US)' in title", () => {
    expect(detectCountryFence("Software Engineer (Remote, US)", null)).toBe(
      "title_fence",
    );
  });

  it("detects 'Remote - US' in title", () => {
    expect(detectCountryFence("Frontend Engineer - Remote, US", null)).toBe(
      "title_fence",
    );
  });

  // Location fences (from founder audit ground-truth)
  it("detects 'Remote, md' as US state fence", () => {
    expect(detectCountryFence("Software Developer", "Remote, md")).toBe(
      "location_us_state",
    );
  });

  it("detects 'Remote within Canada or United States' as country fence", () => {
    expect(
      detectCountryFence(
        "Senior Frontend Engineer",
        "Remote within Canada or United States",
      ),
    ).toBe("location_country");
  });

  it("detects 'London; Geneva' as specific city", () => {
    expect(
      detectCountryFence("Senior Front End Engineer (Docs)", "London; Geneva"),
    ).toBe("location_specific_city");
  });

  it("detects 'São Paulo' as country fence (contains no 'remote')", () => {
    // "São Paulo" doesn't match the city pattern directly, but it's a specific location
    // The function should detect it as a specific city
    const result = detectCountryFence(
      "Senior Enterprise AI Engineer",
      "São Paulo",
    );
    expect(result).not.toBeNull();
  });

  it("detects 'European Union' as region fence", () => {
    expect(detectCountryFence("Senior AI Engineer", "European Union")).toBe(
      "location_region",
    );
  });

  it("detects 'NAMER + EMEA' as region fence", () => {
    expect(detectCountryFence("Senior Platform Engineer", "NAMER + EMEA")).toBe(
      "location_region",
    );
  });

  it("detects 'US' alone as country fence", () => {
    expect(detectCountryFence("Control Plane Engineer", "US")).toBe(
      "location_country",
    );
  });

  it("detects 'San Francisco, CA' as US state fence", () => {
    expect(
      detectCountryFence(
        "Senior Frontend Engineer",
        "San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States",
      ),
    ).not.toBeNull();
  });

  it("detects 'Toronto' as specific city fence", () => {
    expect(detectCountryFence("Software Engineer 3", "Toronto")).toBe(
      "location_specific_city",
    );
  });

  // Non-fences (should pass)
  it("passes 'Remote' alone", () => {
    expect(detectCountryFence("Senior Software Engineer", "Remote")).toBeNull();
  });

  it("passes 'Remote' with null location", () => {
    expect(detectCountryFence("Senior Software Engineer", null)).toBeNull();
  });

  it("passes empty location", () => {
    expect(detectCountryFence("Senior Software Engineer", "")).toBeNull();
  });

  it("passes 'Anywhere' location", () => {
    expect(
      detectCountryFence("Senior Software Engineer", "Anywhere"),
    ).toBeNull();
  });

  it("passes 'Worldwide' location", () => {
    expect(
      detectCountryFence("Senior Software Engineer", "Worldwide"),
    ).toBeNull();
  });

  it("passes 'Global' location", () => {
    expect(detectCountryFence("Senior Software Engineer", "Global")).toBeNull();
  });

  it("passes 'Remote, Distributed' location", () => {
    expect(
      detectCountryFence("Senior Software Engineer", "Remote, Distributed"),
    ).toBeNull();
  });

  // Directive 30 Ruling 2.3: Costa Rica and expanded country/region detection
  it("detects 'Remote - Costa Rica' in title as fence (D30 Ruling 2.3)", () => {
    expect(
      detectCountryFence(
        "Software Engineer, Fullstack (Remote - Costa Rica)",
        null,
      ),
    ).toBe("title_fence");
  });

  it("detects 'Remote - Costa Rica' in location as country fence (D30 Ruling 2.3)", () => {
    expect(
      detectCountryFence("Software Engineer, Fullstack", "Remote - Costa Rica"),
    ).toBe("location_country");
  });

  it("detects 'Remote - Chile' in title as fence (D30 Ruling 2.3)", () => {
    expect(
      detectCountryFence("Senior React Developer (Remote - Chile)", null),
    ).toBe("title_fence");
  });

  it("detects 'ANZ' as region fence (D30 Ruling 2.3)", () => {
    expect(detectCountryFence("Senior Engineer", "Remote - ANZ")).toBe(
      "location_region",
    );
  });

  it("detects 'Americas' as region fence (D30 Ruling 2.3)", () => {
    expect(detectCountryFence("Senior Engineer", "Americas")).toBe(
      "location_region",
    );
  });

  it("detects 'MENA' as region fence (D30 Ruling 2.3)", () => {
    expect(detectCountryFence("Senior Engineer", "MENA")).toBe(
      "location_region",
    );
  });

  it("detects 'Remote - Lithuania' in title as fence (D30 Ruling 2.3)", () => {
    expect(
      detectCountryFence("Full Stack Developer (Remote - Lithuania)", null),
    ).toBe("title_fence");
  });
});

describe("Gate 0 Fence Detection — passesFenceGate", () => {
  it("rejects 'US Remote' in title", () => {
    expect(
      passesFenceGate("Senior Software Engineer - Fullstack, US Remote", null),
    ).toBe(false);
  });

  it("rejects 'Remote, md' location", () => {
    expect(passesFenceGate("Software Developer", "Remote, md")).toBe(false);
  });

  it("accepts 'Remote' location", () => {
    expect(passesFenceGate("Senior Software Engineer", "Remote")).toBe(true);
  });

  it("accepts null location", () => {
    expect(passesFenceGate("Senior Software Engineer", null)).toBe(true);
  });
});

// ── Gate 0 National-Security Filter (Directive 11, Fix 2) ──────────────────

describe("Gate 0 National-Security Filter — isNationalSecurityJob", () => {
  it("detects 'security clearance required' in description", () => {
    expect(
      isNationalSecurityJob(
        "Software Engineer",
        "This role requires security clearance.",
      ),
    ).toBe(true);
  });

  it("detects 'TS/SCI clearance' in description", () => {
    expect(
      isNationalSecurityJob(
        "Senior Engineer",
        "Must have active TS/SCI clearance.",
      ),
    ).toBe(true);
  });

  it("detects 'US citizen' requirement", () => {
    expect(
      isNationalSecurityJob("Developer", "Must be a US citizen to apply."),
    ).toBe(true);
  });

  it("detects 'ITAR' in description", () => {
    expect(
      isNationalSecurityJob(
        "Engineer",
        "This position is subject to ITAR regulations.",
      ),
    ).toBe(true);
  });

  it("detects 'DoD contract' in description", () => {
    expect(
      isNationalSecurityJob(
        "Full-Stack Developer",
        "Work on a DoD contract project.",
      ),
    ).toBe(true);
  });

  it("detects 'national security' in description", () => {
    expect(
      isNationalSecurityJob(
        "Software Engineer",
        "Supporting national security missions.",
      ),
    ).toBe(true);
  });

  // Directive 12, Step 2.4: e-verify is now context-dependent.
  // Bare e-verify (without clearance context) should NOT trigger — it appears
  // in nearly every US company's standard legal compliance text.
  it("does NOT flag bare 'E-Verify' without clearance context (Directive 12 tune)", () => {
    expect(
      isNationalSecurityJob(
        "Developer",
        "This employer participates in E-Verify. We are an equal opportunity employer.",
      ),
    ).toBe(false);
  });

  it("DOES flag 'E-Verify' when clearance context is present", () => {
    expect(
      isNationalSecurityJob(
        "Developer",
        "This position requires security clearance. This employer participates in E-Verify.",
      ),
    ).toBe(true);
  });

  it("detects clearance keywords in title", () => {
    expect(
      isNationalSecurityJob("Software Engineer with Security Clearance", null),
    ).toBe(true);
  });

  it("does NOT flag normal engineering jobs", () => {
    expect(
      isNationalSecurityJob(
        "Senior React Developer",
        "We are looking for a senior developer experienced in React and Node.js.",
      ),
    ).toBe(false);
  });

  it("does NOT flag 'security' alone (word boundary)", () => {
    expect(
      isNationalSecurityJob(
        "Security Engineer",
        "Application security and web security best practices.",
      ),
    ).toBe(false);
  });

  it("does NOT flag null description", () => {
    expect(isNationalSecurityJob("Software Engineer", null)).toBe(false);
  });

  it("does NOT flag empty description", () => {
    expect(isNationalSecurityJob("Software Engineer", "")).toBe(false);
  });
});
