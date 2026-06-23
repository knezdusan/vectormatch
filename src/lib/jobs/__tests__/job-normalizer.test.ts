/**
 * Unit tests for Module C — Job Normalizer (Step 1 of the 3-Gate Funnel).
 *
 * Test coverage (MODULE_C_DECISIONS.md §13, Feature C1):
 *   - ATS-source-aware content extraction (Greenhouse/Lever/Ashby + edge cases)
 *   - Phase 1 regex tag scan (word boundaries, case insensitivity, dedup, C++ vs C)
 *   - Phase 2 LLM fallback (mocked — no real OpenAI calls)
 *   - Rejection threshold (≥1 persona_defining tag required)
 *   - normalization_failed vs rejected distinction
 *   - Idempotency decision tree (§4.6)
 *
 * The LLM extractor is injected via the `llmExtractor` parameter of
 * `normalizeJob` — no vi.mock needed for the AI SDK.
 */

import {
  decideNormalizationAction,
  extractJobContent,
  type LlmTagExtractor,
  normalizeJob,
  scanTagsRegex,
} from "@/lib/jobs/job-normalizer";

// =============================================================================
// extractJobContent — ATS-source-aware content extraction (§4.1)
// =============================================================================

describe("extractJobContent — Greenhouse", () => {
  it("extracts title from `title` and description from `content` (HTML stripped)", () => {
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      content:
        "<p>We are looking for a <strong>React</strong> developer with <em>TypeScript</em> experience.</p>",
    });
    const result = extractJobContent("greenhouse", rawJson, "Fallback Title");

    expect(result.title).toBe("Senior React Engineer");
    expect(result.description).toBe(
      "We are looking for a React developer with TypeScript experience.",
    );
    expect(result.fullText).toBe(
      "Senior React Engineer We are looking for a React developer with TypeScript experience.",
    );
  });

  it("strips HTML entities (&amp; &nbsp; &lt; etc.)", () => {
    const rawJson = JSON.stringify({
      title: "Backend Engineer",
      content: "<p>React &amp; Node.js&nbsp;required</p>",
    });
    const result = extractJobContent("greenhouse", rawJson, "Fallback");

    expect(result.description).toBe("React & Node.js required");
  });

  it("falls back to title-only when content field is missing", () => {
    const rawJson = JSON.stringify({ title: "DevOps Engineer" });
    const result = extractJobContent("greenhouse", rawJson, "Fallback Title");

    expect(result.title).toBe("DevOps Engineer");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("DevOps Engineer");
  });
});

describe("extractJobContent — Lever", () => {
  it("extracts title from `text` and prefers `descriptionPlain` over `description`", () => {
    const rawJson = JSON.stringify({
      text: "Senior Python Developer",
      descriptionPlain: "We need a Python developer with Django experience.",
      description: "<p>We need a <b>Python</b> developer.</p>",
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Senior Python Developer");
    // descriptionPlain is used directly (no HTML stripping needed)
    expect(result.description).toBe(
      "We need a Python developer with Django experience.",
    );
  });

  it("falls back to `description` (HTML) when descriptionPlain is missing", () => {
    const rawJson = JSON.stringify({
      text: "Full Stack Engineer",
      description: "<p>React &amp; Node.js required</p>",
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Full Stack Engineer");
    expect(result.description).toBe("React & Node.js required");
  });

  it("falls back to title-only when both description fields are missing", () => {
    const rawJson = JSON.stringify({ text: "Mobile Engineer" });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Mobile Engineer");
    expect(result.description).toBe("");
  });
});

describe("extractJobContent — Ashby", () => {
  it("extracts title from `title` and prefers `descriptionPlain` over `descriptionHtml`", () => {
    const rawJson = JSON.stringify({
      title: "Senior iOS Engineer",
      descriptionPlain: "Swift and SwiftUI developer needed.",
      descriptionHtml: "<p>Swift developer</p>",
    });
    const result = extractJobContent("ashby", rawJson, "Fallback");

    expect(result.title).toBe("Senior iOS Engineer");
    expect(result.description).toBe("Swift and SwiftUI developer needed.");
  });

  it("falls back to `descriptionHtml` (HTML stripped) when descriptionPlain is missing", () => {
    const rawJson = JSON.stringify({
      title: "Platform Engineer",
      descriptionHtml: "<p>Kubernetes &amp; Terraform required</p>",
    });
    const result = extractJobContent("ashby", rawJson, "Fallback");

    expect(result.title).toBe("Platform Engineer");
    expect(result.description).toBe("Kubernetes & Terraform required");
  });

  it("falls back to title-only when both description fields are missing", () => {
    const rawJson = JSON.stringify({ title: "Data Engineer" });
    const result = extractJobContent("ashby", rawJson, "Fallback");

    expect(result.title).toBe("Data Engineer");
    expect(result.description).toBe("");
  });
});

describe("extractJobContent — edge cases", () => {
  it("degrades to fallback title for unknown ATS source", () => {
    const rawJson = JSON.stringify({
      title: "Some Title",
      description: "Some description",
    });
    const result = extractJobContent("workday", rawJson, "DB Title");

    expect(result.title).toBe("DB Title");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("DB Title");
  });

  it("degrades to fallback title when rawJson is invalid JSON", () => {
    const result = extractJobContent(
      "greenhouse",
      "not valid json",
      "DB Title",
    );

    expect(result.title).toBe("DB Title");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("DB Title");
  });

  it("degrades to fallback title when rawJson is not an object", () => {
    const result = extractJobContent(
      "greenhouse",
      '"just a string"',
      "DB Title",
    );

    expect(result.title).toBe("DB Title");
    expect(result.description).toBe("");
  });

  it("uses fallback title when Greenhouse title field is not a string", () => {
    const rawJson = JSON.stringify({ title: 123, content: "<p>desc</p>" });
    const result = extractJobContent("greenhouse", rawJson, "DB Title");

    expect(result.title).toBe("DB Title");
  });
});

// =============================================================================
// scanTagsRegex — Phase 1 regex tag scan (§4.2)
// =============================================================================

describe("scanTagsRegex", () => {
  it("finds canonical tag labels in text (case insensitive)", () => {
    const text =
      "We need a react developer with typescript and Python experience";
    const tags = scanTagsRegex(text);

    expect(tags).toContain("react");
    expect(tags).toContain("typescript");
    expect(tags).toContain("python");
  });

  it("deduplicates tags found multiple times", () => {
    const text =
      "React developer needed. React experience required. React React React.";
    const tags = scanTagsRegex(text);

    expect(tags.filter((t) => t === "react")).toHaveLength(1);
  });

  it("does not match tags mid-word (word boundary)", () => {
    // "Reactive" should not match "React"
    const tags = scanTagsRegex("We use ReactiveX for state management");
    expect(tags).not.toContain("react");
  });

  it("matches C++ but not C inside C++ (longer labels first)", () => {
    const tags = scanTagsRegex("C++ developer needed");
    expect(tags).toContain("cpp");
    // "C" should not also be matched inside "C++"
    // Note: "C" is a persona_defining tag, so a false positive here would
    // incorrectly mark a C++ job as having a persona_defining tag.
    // The regex sorts labels by length descending so "C++" matches first.
    expect(tags).not.toContain("c");
  });

  it("matches C# but not C inside C#", () => {
    const tags = scanTagsRegex("C# backend engineer");
    expect(tags).toContain("csharp");
    expect(tags).not.toContain("c");
  });

  it("matches standalone C (single letter tag)", () => {
    const tags = scanTagsRegex("Embedded C developer for firmware");
    expect(tags).toContain("c");
  });

  it("matches Next.js label (contains special chars)", () => {
    const tags = scanTagsRegex("Next.js App Router experience required");
    expect(tags).toContain("nextjs");
  });

  it("matches Node.js label", () => {
    const tags = scanTagsRegex("Node.js backend with Express");
    expect(tags).toContain("nodejs");
  });

  it("returns empty array for text with no tags", () => {
    const tags = scanTagsRegex("We are hiring a marketing manager");
    expect(tags).toEqual([]);
  });

  it("finds tags in a realistic job description", () => {
    const text =
      "Senior Frontend Engineer\n\n" +
      "We are looking for a senior frontend engineer with deep expertise in " +
      "React, TypeScript, and Next.js. You will build customer-facing features " +
      "using Tailwind CSS and modern testing tools like Vitest and Playwright. " +
      "Experience with PostgreSQL is a plus.";
    const tags = scanTagsRegex(text);

    expect(tags).toContain("react");
    expect(tags).toContain("typescript");
    expect(tags).toContain("nextjs");
    expect(tags).toContain("postgresql");
    // Supporting tags too
    expect(tags).toContain("tailwindcss");
    expect(tags).toContain("vitest");
    expect(tags).toContain("playwright");
  });
});

// =============================================================================
// normalizeJob — main orchestration (§4.3)
// =============================================================================

describe("normalizeJob", () => {
  // A mock LLM extractor that returns specified tags.
  const makeMockLlm =
    (tags: string[]): LlmTagExtractor =>
    async () =>
      tags;

  const makeMockLlmThatThrows =
    (error: Error): LlmTagExtractor =>
    async () => {
      throw error;
    };

  // ── Phase 1 regex finds ≥1 persona_defining tag → 'normalized' ──────────

  it("returns 'normalized' when Phase 1 regex finds ≥1 persona_defining tag (no LLM call)", async () => {
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      content: "<p>React, TypeScript, and Next.js developer needed.</p>",
    });
    const llmSpy = vi.fn(async () => [
      "should-not-be-called",
    ]) as LlmTagExtractor;

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      llmSpy,
    );

    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("react");
    expect(result.tags).toContain("typescript");
    expect(result.tags).toContain("nextjs");
    // LLM should NOT have been called
    expect(llmSpy).not.toHaveBeenCalled();
  });

  it("returns 'normalized' with fullText for embedding", async () => {
    const rawJson = JSON.stringify({
      title: "Python Backend Developer",
      content: "<p>Django and PostgreSQL experience required.</p>",
    });

    const result = await normalizeJob("greenhouse", rawJson, "Fallback");

    expect(result.status).toBe("normalized");
    expect(result.fullText).toContain("Python Backend Developer");
    expect(result.fullText).toContain("Django and PostgreSQL");
  });

  // ── Phase 1 finds 0 persona_defining → Phase 2 LLM fallback ─────────────

  it("triggers Phase 2 LLM fallback when Phase 1 finds 0 persona_defining tags", async () => {
    // Text with only supporting tags (css, html) — no persona_defining
    const rawJson = JSON.stringify({
      title: "Design Systems Engineer",
      content: "<p>CSS and HTML knowledge required for this design role.</p>",
    });
    const mockLlm = makeMockLlm(["react", "typescript"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("react");
    expect(result.tags).toContain("typescript");
    // Phase 1 tags should be merged with Phase 2 tags
    expect(result.tags).toContain("css");
    expect(result.tags).toContain("html");
  });

  it("returns 'rejected' when Phase 2 LLM also finds 0 persona_defining tags", async () => {
    // Text with no tech tags at all
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content: "<p>Manage office operations and scheduling.</p>",
    });
    // LLM returns only supporting tags or empty
    const mockLlm = makeMockLlm([]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("rejected");
  });

  it("returns 'rejected' when Phase 2 LLM returns only supporting tags", async () => {
    const rawJson = JSON.stringify({
      title: "QA Analyst",
      content: "<p>Manual testing with some CSS knowledge.</p>",
    });
    // LLM returns only supporting tags (no persona_defining)
    const mockLlm = makeMockLlm(["css", "html", "git"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("rejected");
  });

  // ── Phase 2 LLM call fails → 'normalization_failed' ─────────────────────

  it("returns 'normalization_failed' when Phase 2 LLM call throws", async () => {
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content: "<p>Manage office operations.</p>",
    });
    const mockLlm = makeMockLlmThatThrows(
      new Error("OpenAI rate limit exceeded"),
    );

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("normalization_failed");
    expect(result.error).toBe("OpenAI rate limit exceeded");
    // Phase 1 tags should still be present (for debugging)
    expect(result.tags).toBeDefined();
  });

  it("returns 'normalization_failed' with error message for non-Error throws", async () => {
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content: "<p>Manage office operations.</p>",
    });
    const mockLlm = makeMockLlmThatThrows(new Error("timeout"));

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("normalization_failed");
    expect(result.error).toBe("timeout");
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it("handles unknown ATS source by using title-only text", async () => {
    const rawJson = JSON.stringify({
      title: "React Developer",
      description: "desc",
    });
    const result = await normalizeJob(
      "unknown_ats",
      rawJson,
      "React Developer",
    );

    // Title "React Developer" contains "React" which is persona_defining
    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("react");
  });

  it("handles invalid JSON by using fallback title", async () => {
    const result = await normalizeJob(
      "greenhouse",
      "not json",
      "Python Developer",
    );

    // Title "Python Developer" contains "Python" which is persona_defining
    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("python");
  });
});

// =============================================================================
// decideNormalizationAction — idempotency decision tree (§4.6)
// =============================================================================

describe("decideNormalizationAction — idempotency decision tree", () => {
  it("skips when normalizedAt is set (already processed)", () => {
    const decision = decideNormalizationAction({
      status: "active",
      normalizedAt: new Date("2026-06-23T10:00:00Z"),
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("Already processed");
  });

  it("skips when status is 'rejected' (garbage tombstone)", () => {
    const decision = decideNormalizationAction({
      status: "rejected",
      normalizedAt: null,
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("Rejected tombstone");
  });

  it("normalizes when status is 'normalization_failed' (retry)", () => {
    const decision = decideNormalizationAction({
      status: "normalization_failed",
      normalizedAt: null,
    });

    expect(decision.action).toBe("normalize");
    expect(decision.reason).toContain("Retrying");
  });

  it("skips when status is 'stale' (aged out)", () => {
    const decision = decideNormalizationAction({
      status: "stale",
      normalizedAt: null,
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("aged out");
  });

  it("skips when status is 'gone' (aged out)", () => {
    const decision = decideNormalizationAction({
      status: "gone",
      normalizedAt: null,
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("aged out");
  });

  it("normalizes when status is 'active' and normalizedAt is null", () => {
    const decision = decideNormalizationAction({
      status: "active",
      normalizedAt: null,
    });

    expect(decision.action).toBe("normalize");
    expect(decision.reason).toBeUndefined();
  });

  it("skips on normalizedAt check BEFORE status check (rejected + normalizedAt set)", () => {
    // A rejected job has normalizedAt = NOW() (set during rejection).
    // The normalizedAt check should fire first → skip.
    const decision = decideNormalizationAction({
      status: "rejected",
      normalizedAt: new Date("2026-06-23T10:00:00Z"),
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("Already processed");
  });
});
