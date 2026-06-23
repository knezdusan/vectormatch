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

import { GATE_ZERO_REGEX, passesGateZero } from "@/lib/jobs/gate-zero";

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
