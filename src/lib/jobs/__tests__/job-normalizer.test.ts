/**
 * Unit tests for Module C — Job Normalizer (Step 1 of the 3-Gate Funnel).
 *
 * Test coverage (MODULE_C_DECISIONS.md §14, Feature C1):
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
  type AggregatorJob,
  decideNormalizationAction,
  extractJobContent,
  extractJobMetadata,
  extractJobUrl,
  inferRemoteScope,
  type LlmSummaryExtractor,
  type LlmTagExtractor,
  normalizeAggregatorJob,
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

  // Regression: Lever sometimes returns descriptionPlain as "" even when
  // description (HTML) has content. The old code checked `typeof === "string"`
  // which passed for empty strings, causing the HTML fallback to never trigger.
  // This resulted in title-only fullText → LLM rejected legitimate software jobs.
  it("falls back to `description` (HTML) when descriptionPlain is empty string", () => {
    const rawJson = JSON.stringify({
      text: "DevOps Engineer",
      descriptionPlain: "",
      description: "<p>Docker &amp; Kubernetes required</p>",
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("DevOps Engineer");
    expect(result.description).toBe("Docker & Kubernetes required");
    expect(result.fullText).toContain("Docker & Kubernetes required");
  });

  // Regression: Lever jobs often store tech requirements in a `lists` array
  // (sections like "Requirements", "Tech Stack") rather than in description.
  // The normalizer must extract this content so the tag scan can find keywords.
  it("extracts content from Lever `lists` array and appends to fullText", () => {
    const rawJson = JSON.stringify({
      text: "Senior Software Engineer",
      descriptionPlain: "About the role: We are looking for a senior engineer.",
      description: "<p>About the role</p>",
      lists: [
        {
          text: "Required Experience",
          content: "<li>10+ years of Java and C++ experience</li>",
        },
        {
          text: "Desired Skills",
          content: "<li>Experience with Ruby on Rails and JavaScript</li>",
        },
      ],
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Senior Software Engineer");
    expect(result.fullText).toContain("Java");
    expect(result.fullText).toContain("C++");
    expect(result.fullText).toContain("Ruby on Rails");
    expect(result.fullText).toContain("JavaScript");
    expect(result.fullText).toContain("Required Experience");
    expect(result.fullText).toContain("Desired Skills");
  });

  it("handles Lever jobs with empty lists array", () => {
    const rawJson = JSON.stringify({
      text: "Backend Engineer",
      descriptionPlain: "Python developer needed.",
      lists: [],
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Backend Engineer");
    expect(result.description).toBe("Python developer needed.");
  });

  it("handles Lever jobs with no lists field", () => {
    const rawJson = JSON.stringify({
      text: "Frontend Engineer",
      descriptionPlain: "React developer needed.",
    });
    const result = extractJobContent("lever", rawJson, "Fallback");

    expect(result.title).toBe("Frontend Engineer");
    expect(result.description).toBe("React developer needed.");
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

  // Regression: Same empty-string bug as Lever — Ashby may return
  // descriptionPlain as "" when descriptionHtml has content.
  it("falls back to `descriptionHtml` (HTML stripped) when descriptionPlain is empty string", () => {
    const rawJson = JSON.stringify({
      title: "Platform Engineer",
      descriptionPlain: "",
      descriptionHtml: "<p>Kubernetes &amp; Terraform required</p>",
    });
    const result = extractJobContent("ashby", rawJson, "Fallback");

    expect(result.title).toBe("Platform Engineer");
    expect(result.description).toBe("Kubernetes & Terraform required");
    expect(result.fullText).toContain("Kubernetes & Terraform required");
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
// extractJobUrl — ATS-source-aware job posting URL extraction
// =============================================================================

describe("extractJobUrl — Greenhouse", () => {
  it("extracts the absolute_url field", () => {
    const rawJson = JSON.stringify({
      title: "Senior Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
    });
    expect(extractJobUrl("greenhouse", rawJson)).toBe(
      "https://boards.greenhouse.io/acme/jobs/12345",
    );
  });

  it("returns null when absolute_url is missing", () => {
    const rawJson = JSON.stringify({ title: "Senior Engineer" });
    expect(extractJobUrl("greenhouse", rawJson)).toBeNull();
  });
});

describe("extractJobUrl — Lever", () => {
  it("extracts the hostedUrl field", () => {
    const rawJson = JSON.stringify({
      text: "Senior Engineer",
      hostedUrl: "https://jobs.lever.co/acme/abc-123",
    });
    expect(extractJobUrl("lever", rawJson)).toBe(
      "https://jobs.lever.co/acme/abc-123",
    );
  });

  it("returns null when hostedUrl is missing", () => {
    const rawJson = JSON.stringify({ text: "Senior Engineer" });
    expect(extractJobUrl("lever", rawJson)).toBeNull();
  });
});

describe("extractJobUrl — Ashby", () => {
  it("extracts the jobUrl field", () => {
    const rawJson = JSON.stringify({
      title: "Platform Engineer",
      jobUrl:
        "https://jobs.ashbyhq.com/Mapbox/a5a21e26-1901-48f6-8dc8-8d0f8224c6bc",
    });
    expect(extractJobUrl("ashby", rawJson)).toBe(
      "https://jobs.ashbyhq.com/Mapbox/a5a21e26-1901-48f6-8dc8-8d0f8224c6bc",
    );
  });

  it("returns null when jobUrl is missing (some boards omit it)", () => {
    const rawJson = JSON.stringify({ title: "Platform Engineer" });
    expect(extractJobUrl("ashby", rawJson)).toBeNull();
  });
});

describe("extractJobUrl — edge cases", () => {
  it("returns null for unknown ATS source", () => {
    const rawJson = JSON.stringify({ url: "https://example.com/job" });
    expect(extractJobUrl("workday", rawJson)).toBeNull();
  });

  it("returns null when rawJson is invalid JSON", () => {
    expect(extractJobUrl("greenhouse", "not valid json")).toBeNull();
  });

  it("returns null when rawJson is not an object", () => {
    expect(extractJobUrl("greenhouse", '"just a string"')).toBeNull();
  });

  it("returns null when the URL field is not a string", () => {
    const rawJson = JSON.stringify({ absolute_url: 12345 });
    expect(extractJobUrl("greenhouse", rawJson)).toBeNull();
  });

  it("returns null when the URL field is an empty string", () => {
    const rawJson = JSON.stringify({ absolute_url: "" });
    expect(extractJobUrl("greenhouse", rawJson)).toBeNull();
  });
});

// =============================================================================
// extractJobMetadata — ATS-source-aware metadata extraction
// =============================================================================

describe("extractJobMetadata — Greenhouse", () => {
  it("extracts company_name from the undocumented field", () => {
    const rawJson = JSON.stringify({
      title: "Senior Engineer",
      company_name: "Chime Financial, Inc",
      location: { name: "New York, NY" },
      first_published: "2026-06-25T18:20:09-04:00",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.companyName).toBe("Chime Financial, Inc");
  });

  it("extracts location from nested location.name", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "San Francisco, CA, USA" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.locationName).toBe("San Francisco, CA, USA");
  });

  it("detects remote from location string heuristic", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "United States (remote)" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote case-insensitively", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Remote - United States" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("keeps null when location has no workplace keyword (zero-match fix)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "New York, NY" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    // July 2026 fix: null workplaceType is kept (not defaulted to on-site).
    // Gate 0.5 only hard-rejects EXPLICIT on-site. Null passes to Gate 3 (LLM).
    expect(meta.workplaceType).toBe(null);
  });

  it("detects hybrid from location string heuristic", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Hybrid - London, Berlin" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("detects hybrid case-insensitively", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "HYBRID - San Francisco" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("classifies 'Hybrid - Remote' as hybrid (not remote)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Hybrid - Remote" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("detects on-site from 'on-site' keyword in location", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "On-site - New York" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("detects on-site from 'onsite' keyword (no hyphen) in location", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Onsite - Berlin" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("detects on-site from 'in-office' keyword in location", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "In-office - Tokyo" },
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("extracts department from departments array (with ?content=true)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      departments: [{ id: 1, name: "Engineering" }],
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.department).toBe("Engineering");
  });

  it("parses first_published as a Date", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      first_published: "2026-06-25T18:20:09-04:00",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.publishedAt).toBeInstanceOf(Date);
    expect(meta.publishedAt?.getFullYear()).toBe(2026);
  });

  it("returns null employmentType (not available for Greenhouse)", () => {
    const rawJson = JSON.stringify({ title: "Engineer" });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.employmentType).toBeNull();
  });

  // ── Content-based workplace_type fallback ─────────────────────────────────
  // When the location heuristic returns null (84.9% of Greenhouse jobs), scan
  // the content (HTML description) for workplace-type phrases. This reduces
  // NULL workplace_type from 84.9% to a much lower rate, giving Gate 3 better
  // structured metadata instead of forcing the LLM to guess.

  it("detects remote from content when location has no keyword", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "San Francisco, CA" },
      content: "<p>This is a fully remote position.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'work from home' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "New York, NY" },
      content: "<p>You can work from home for this role.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'remote eligible' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Austin, TX" },
      content: "<p>This position is remote eligible.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects hybrid from content when location has no keyword", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "London" },
      content: "<p>This is a hybrid role with 2-3 days in office.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("detects hybrid from 'hybrid' keyword in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Berlin" },
      content: "<p>We offer a hybrid work model.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("detects on-site from 'in-office' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Tokyo" },
      content: "<p>This is an in-office position.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("detects on-site from 'must work from office' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Mumbai, India" },
      content: "<p>Candidate must work from our Mumbai office.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("prefers hybrid over remote when content mentions both", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Dublin" },
      content: "<p>This is a hybrid role with some remote work days.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("does not detect remote from 'remote access' (false positive guard)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Huntsville, AL" },
      content: "<p>Experience with remote access systems required.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    // July 2026 fix: no remote keywords found → null (not defaulted to on-site)
    expect(meta.workplaceType).toBe(null);
  });

  it("keeps null when content has no workplace keywords (zero-match fix)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Bengaluru, India" },
      content: "<p>We are looking for a senior engineer to join our team.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    // CloudSEK pattern: location is stated, no remote designation.
    // July 2026 fix: kept as null, passed to Gate 3 (LLM) for evaluation.
    expect(meta.workplaceType).toBe(null);
  });

  it("location heuristic takes precedence over content fallback", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Remote - United States" },
      content: "<p>This is an in-office position in our SF office.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  // ── Expanded remote-detection patterns (July 2026 zero-match fix) ──────────

  it("detects remote from 'global, remote-first' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "San Francisco, CA" },
      content: "<p>We are a global, remote-first organization.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'work from anywhere' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Berlin, Germany" },
      content: "<p>Work from anywhere in the world.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'distributed team' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "London, UK" },
      content: "<p>We are a distributed team across 15 countries.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'Remote - Worldwide' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "New York, NY" },
      content: "<p>Remote - Worldwide</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("detects remote from 'team members across N countries' in content", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: { name: "Toronto, Canada" },
      content: "<p>Our team members across 30 countries collaborate async.</p>",
    });
    const meta = extractJobMetadata("greenhouse", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });
});

describe("extractJobMetadata — Lever", () => {
  it("extracts workplaceType from lowercase Lever values", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      workplaceType: "remote",
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("normalizes 'onsite' (no hyphen) to 'on-site'", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      workplaceType: "onsite",
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("normalizes 'hybrid' to 'hybrid'", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      workplaceType: "hybrid",
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("returns null workplaceType for 'unspecified'", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      workplaceType: "unspecified",
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.workplaceType).toBeNull();
  });

  it("extracts employmentType from categories.commitment", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      categories: { commitment: "Full-time" },
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.employmentType).toBe("full-time");
  });

  it("maps 'Intern' commitment to 'internship'", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      categories: { commitment: "Intern" },
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.employmentType).toBe("internship");
  });

  it("extracts location, department, and team from categories", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      categories: {
        location: "Bengaluru, IN",
        department: "Quality Engineering",
        team: "11250 - QA",
      },
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.locationName).toBe("Bengaluru, IN");
    expect(meta.department).toBe("Quality Engineering");
    expect(meta.team).toBe("11250 - QA");
  });

  it("extracts applyUrl", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      applyUrl: "https://jobs.lever.co/acme/abc-123/apply",
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.applyUrl).toBe("https://jobs.lever.co/acme/abc-123/apply");
  });

  it("parses createdAt as epoch milliseconds", () => {
    const rawJson = JSON.stringify({
      text: "Engineer",
      createdAt: 1780301748120,
    });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.publishedAt).toBeInstanceOf(Date);
  });

  it("returns null companyName (Lever v0 doesn't include it)", () => {
    const rawJson = JSON.stringify({ text: "Engineer" });
    const meta = extractJobMetadata("lever", rawJson);
    expect(meta.companyName).toBeNull();
  });
});

describe("extractJobMetadata — Ashby", () => {
  it("extracts workplaceType from PascalCase Ashby values", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: "Remote",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("normalizes 'OnSite' to 'on-site'", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: "OnSite",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });

  it("normalizes 'Hybrid' to 'hybrid'", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: "Hybrid",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("returns null workplaceType when field is null (53.5% of real data)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: null,
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBeNull();
  });

  it("falls back to isRemote string 'true' when workplaceType is null", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: null,
      isRemote: "true",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("falls back to isRemote boolean true when workplaceType is null", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: null,
      isRemote: true,
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBe("remote");
  });

  it("does not set remote when isRemote is 'false'", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplaceType: null,
      isRemote: "false",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.workplaceType).toBeNull();
  });

  it("extracts employmentType from PascalCase Ashby values", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      employmentType: "FullTime",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.employmentType).toBe("full-time");
  });

  it("maps 'Intern' to 'internship'", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      employmentType: "Intern",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.employmentType).toBe("internship");
  });

  it("maps 'Temporary' to 'contract'", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      employmentType: "Temporary",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.employmentType).toBe("contract");
  });

  it("extracts location as string (always string in Public API)", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      location: "New York, NY (HQ)",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.locationName).toBe("New York, NY (HQ)");
  });

  it("extracts department, team, and applyUrl", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      department: "Engineering",
      team: "Software Engineering - Industry",
      applyUrl: "https://jobs.ashbyhq.com/ramp/abc/application",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.department).toBe("Engineering");
    expect(meta.team).toBe("Software Engineering - Industry");
    expect(meta.applyUrl).toBe("https://jobs.ashbyhq.com/ramp/abc/application");
  });

  it("parses publishedAt as ISO 8601", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      publishedAt: "2026-06-26T01:57:53.065+00:00",
    });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.publishedAt).toBeInstanceOf(Date);
    expect(meta.publishedAt?.getFullYear()).toBe(2026);
  });

  it("returns null companyName (Ashby Public API doesn't include it)", () => {
    const rawJson = JSON.stringify({ title: "Engineer" });
    const meta = extractJobMetadata("ashby", rawJson);
    expect(meta.companyName).toBeNull();
  });
});

describe("extractJobMetadata — edge cases", () => {
  it("returns all-null metadata for unknown ATS source", () => {
    const rawJson = JSON.stringify({ title: "Engineer" });
    const meta = extractJobMetadata("workday", rawJson);
    expect(meta.workplaceType).toBeNull();
    expect(meta.employmentType).toBeNull();
    expect(meta.locationName).toBeNull();
    expect(meta.companyName).toBeNull();
  });

  it("returns all-null metadata when rawJson is invalid JSON", () => {
    const meta = extractJobMetadata("greenhouse", "not valid json");
    expect(meta.workplaceType).toBeNull();
    expect(meta.companyName).toBeNull();
  });

  it("returns all-null metadata when rawJson is not an object", () => {
    const meta = extractJobMetadata("greenhouse", '"just a string"');
    expect(meta.workplaceType).toBeNull();
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

  // Mock summary extractor — avoids real OpenAI calls during tests.
  const mockSummaryExtractor: LlmSummaryExtractor = async () =>
    "Mock summary for testing.";

  // ── Phase 1 regex finds ≥1 persona_defining tag → 'normalized' ──────────

  it("includes the AI summary when normalization succeeds", async () => {
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      content:
        "<p>React, TypeScript, and Next.js developer needed. " +
        "You will build user interfaces and work on a fast-paced team " +
        "delivering high-quality software products.</p>",
    });
    const customSummary =
      "Senior React engineer building UI with TypeScript and Next.js.";
    const customSummaryExtractor: LlmSummaryExtractor = async () =>
      customSummary;

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      undefined,
      customSummaryExtractor,
    );

    expect(result.status).toBe("normalized");
    expect(result.summary).toBe(customSummary);
  });

  it("returns jobUrl extracted from rawJson for normalized jobs", async () => {
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
      content:
        "<p>React, TypeScript, and Next.js developer needed. " +
        "You will build user interfaces and work on a fast-paced team.</p>",
    });
    const mockLlm: LlmTagExtractor = async () => ["react", "typescript"];

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
    );

    expect(result.status).toBe("normalized");
    expect(result.jobUrl).toBe("https://boards.greenhouse.io/acme/jobs/12345");
  });

  it("returns 'normalized' when Phase 1 regex finds ≥1 persona_defining tag (no LLM call)", async () => {
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      content:
        "<p>React, TypeScript, and Next.js developer needed. " +
        "You will build user interfaces and work on a fast-paced team " +
        "delivering high-quality software products.</p>",
    });
    const llmSpy = vi.fn(async () => [
      "should-not-be-called",
    ]) as LlmTagExtractor;

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      llmSpy,
      mockSummaryExtractor,
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
      content:
        "<p>Django and PostgreSQL experience required. " +
        "You will build scalable backend services and APIs using Python. " +
        "Experience with REST and GraphQL is a plus.</p>",
    });

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      undefined,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalized");
    expect(result.fullText).toContain("Python Backend Developer");
    expect(result.fullText).toContain("Django and PostgreSQL");
  });

  // ── Phase 1 finds 0 persona_defining → Phase 2 LLM fallback ─────────────

  it("triggers Phase 2 LLM fallback when Phase 1 finds 0 persona_defining tags", async () => {
    // Text with only supporting tags (css, html) — no persona_defining.
    // Content must be > 100 chars to pass the title-only guard.
    const rawJson = JSON.stringify({
      title: "Design Systems Engineer",
      content:
        "<p>CSS and HTML knowledge required for this design role. " +
        "You will work on the design system, maintaining component libraries " +
        "and ensuring visual consistency across all products and platforms.</p>",
    });
    const mockLlm = makeMockLlm(["react", "typescript"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("react");
    expect(result.tags).toContain("typescript");
    // Phase 1 tags should be merged with Phase 2 tags
    expect(result.tags).toContain("css");
    expect(result.tags).toContain("html");
  });

  it("returns 'rejected' when Phase 2 LLM also finds 0 persona_defining tags", async () => {
    // Text with no tech tags at all — content > 100 chars to pass title-only guard
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content:
        "<p>Manage office operations and scheduling for a growing team. " +
        "Responsibilities include coordinating meetings, managing supplies, " +
        "and supporting the executive team with administrative tasks.</p>",
    });
    // LLM returns only supporting tags or empty
    const mockLlm = makeMockLlm([]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("no_tags");
  });

  it("returns 'rejected' when Phase 2 LLM returns only supporting tags", async () => {
    // Content > 100 chars to pass title-only guard
    const rawJson = JSON.stringify({
      title: "QA Analyst",
      content:
        "<p>Manual testing with some CSS knowledge required. " +
        "You will be responsible for test case creation, execution, and " +
        "reporting. Experience with test management tools is a plus.</p>",
    });
    // LLM returns only supporting tags (no persona_defining)
    const mockLlm = makeMockLlm(["css", "html", "git"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("no_tags");
  });

  it("returns jobUrl for rejected jobs so the URL can be persisted before rawJson is nullified", async () => {
    const rawJson = JSON.stringify({
      title: "QA Analyst",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/99999",
      content:
        "<p>Manual testing with some CSS knowledge required. " +
        "You will be responsible for test case creation and execution.</p>",
    });
    const mockLlm = makeMockLlm(["css"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.jobUrl).toBe("https://boards.greenhouse.io/acme/jobs/99999");
  });

  // ── Phase 2 LLM call fails → 'normalization_failed' ─────────────────────

  it("returns 'normalization_failed' when Phase 2 LLM call throws", async () => {
    // Content > 100 chars to pass title-only guard
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content:
        "<p>Manage office operations and scheduling for a growing team. " +
        "Responsibilities include coordinating meetings, managing supplies, " +
        "and supporting the executive team with administrative tasks.</p>",
    });
    const mockLlm = makeMockLlmThatThrows(
      new Error("OpenAI rate limit exceeded"),
    );

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalization_failed");
    expect(result.error).toBe("OpenAI rate limit exceeded");
    // Phase 1 tags should still be present (for debugging)
    expect(result.tags).toBeDefined();
  });

  it("returns jobUrl for normalization_failed jobs so retries preserve the listing URL", async () => {
    const rawJson = JSON.stringify({
      title: "Office Manager",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/88888",
      content:
        "<p>Manage office operations and scheduling for a growing team. " +
        "Responsibilities include coordinating meetings and managing supplies.</p>",
    });
    const mockLlm = makeMockLlmThatThrows(new Error("timeout"));

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalization_failed");
    expect(result.jobUrl).toBe("https://boards.greenhouse.io/acme/jobs/88888");
  });

  it("returns 'normalization_failed' with error message for non-Error throws", async () => {
    // Content > 100 chars to pass title-only guard
    const rawJson = JSON.stringify({
      title: "Office Manager",
      content:
        "<p>Manage office operations and scheduling for a growing team. " +
        "Responsibilities include coordinating meetings, managing supplies, " +
        "and supporting the executive team with administrative tasks.</p>",
    });
    const mockLlm = makeMockLlmThatThrows(new Error("timeout"));

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalization_failed");
    expect(result.error).toBe("timeout");
  });

  // ── Title-only rejection guard (fullText < 100 chars) ───────────────────

  it("rejects title-only jobs with fullText < 100 chars (no LLM call)", async () => {
    const rawJson = JSON.stringify({
      title: "Software Engineer",
      content: "<p>Short desc.</p>",
    });
    const llmSpy = vi.fn(async () => [
      "should-not-be-called",
    ]) as LlmTagExtractor;

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      llmSpy,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
    expect(result.tags).toEqual([]);
    // LLM should NOT have been called — title-only guard short-circuits
    expect(llmSpy).not.toHaveBeenCalled();
  });

  it("rejects SmartRecruiters title-only jobs (metadata-only pseudo-description < 100 chars)", async () => {
    // Simulates a SmartRecruiters job where the detail fetch failed and only
    // the Tier 1 pseudo-description (title + metadata) is available.
    const rawJson = JSON.stringify({
      name: "Senior Machine Learning Engineer",
      location: { city: "Sydney", country: "au", remote: true },
      typeOfEmployment: { label: "Full-time" },
      company: { name: "Canva" },
    });
    const llmSpy = vi.fn(async () => [
      "should-not-be-called",
    ]) as LlmTagExtractor;

    const result = await normalizeJob(
      "smartrecruiters",
      rawJson,
      "Fallback",
      llmSpy,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
    expect(llmSpy).not.toHaveBeenCalled();
  });

  it("allows jobs with fullText exactly 100 chars", async () => {
    // fullText must be exactly 100 chars to pass the guard (>= 100)
    const title = "React Developer";
    // Build content so that title + " " + content = exactly 100 chars
    // title is 15 chars, + 1 space = 16, need content = 84 chars
    const content = "A".repeat(84);
    const rawJson = JSON.stringify({ title, content });
    const mockLlm = makeMockLlm(["react"]);

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    // Should NOT be rejected as title_only (fullText is exactly 100 chars)
    expect(result.status).not.toBe("rejected");
    expect(result.rejectionReason).not.toBe("title_only");
  });

  it("rejects jobs with fullText 99 chars (just below threshold)", async () => {
    const title = "React Developer";
    // title is 15 chars, + 1 space = 16, need content = 83 chars → fullText = 99
    const content = "A".repeat(83);
    const rawJson = JSON.stringify({ title, content });

    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      undefined,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it("handles unknown ATS source by using title-only text (rejected by guard)", async () => {
    const rawJson = JSON.stringify({
      title: "React Developer",
      description: "desc",
    });
    const result = await normalizeJob(
      "unknown_ats",
      rawJson,
      "React Developer",
      undefined,
      mockSummaryExtractor,
    );

    // Title "React Developer" + "desc" = 20 chars → rejected by title-only guard
    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
  });

  it("handles invalid JSON by using fallback title (rejected by guard if short)", async () => {
    const result = await normalizeJob(
      "greenhouse",
      "not json",
      "Python Developer",
      undefined,
      mockSummaryExtractor,
    );

    // Title "Python Developer" = 16 chars → rejected by title-only guard
    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
  });

  it("handles invalid JSON with long fallback title (passes guard, finds tags)", async () => {
    // Long enough title with persona_defining tag to pass guard + regex.
    // Must be > 100 chars to pass the title-only guard.
    const longTitle =
      "Senior Python Developer with Django and PostgreSQL experience needed for backend role " +
      "at a fast-growing startup building scalable web applications with modern technologies";
    const result = await normalizeJob(
      "greenhouse",
      "not json",
      longTitle,
      undefined,
      mockSummaryExtractor,
    );

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

// =============================================================================
// G7: normalizedText fast path + nullable rawJson (CORPUS_EXPANSION_TDD §1.1)
// =============================================================================

describe("extractJobContent — G7 normalizedText fast path", () => {
  it("returns normalizedText directly when provided (no rawJson parsing)", () => {
    const normalizedText =
      "Senior React Engineer We are looking for a React developer with TypeScript experience.";
    const result = extractJobContent(
      "greenhouse",
      null,
      "Senior React Engineer",
      normalizedText,
    );

    expect(result.title).toBe("Senior React Engineer");
    expect(result.description).toBe(normalizedText);
    expect(result.fullText).toBe(normalizedText);
  });

  it("returns normalizedText directly even when rawJson is also present", () => {
    // After G7, rawJson might still be present during the transition period.
    // normalizedText takes priority — no HTML stripping or parsing needed.
    const rawJson = JSON.stringify({
      title: "Old Title",
      content: "<p>Old <b>HTML</b> content</p>",
    });
    const normalizedText = "Cleaned text from normalization step";
    const result = extractJobContent(
      "greenhouse",
      rawJson,
      "DB Title",
      normalizedText,
    );

    expect(result.fullText).toBe(normalizedText);
    expect(result.description).toBe(normalizedText);
  });

  it("ignores empty-string normalizedText and falls back to rawJson", () => {
    const rawJson = JSON.stringify({
      title: "Backend Engineer",
      content: "<p>Node.js and PostgreSQL required</p>",
    });
    const result = extractJobContent(
      "greenhouse",
      rawJson,
      "Backend Engineer",
      "",
    );

    // Empty normalizedText → fall back to rawJson parsing
    expect(result.description).toBe("Node.js and PostgreSQL required");
  });

  it("ignores null normalizedText and falls back to rawJson", () => {
    const rawJson = JSON.stringify({
      title: "DevOps Engineer",
      content: "<p>Kubernetes and Terraform</p>",
    });
    const result = extractJobContent(
      "greenhouse",
      rawJson,
      "DevOps Engineer",
      null,
    );

    expect(result.description).toBe("Kubernetes and Terraform");
  });
});

describe("extractJobContent — G7 nullable rawJson (no normalizedText)", () => {
  it("degrades to title-only when rawJson is null and no normalizedText", () => {
    const result = extractJobContent("greenhouse", null, "Fallback Title");

    expect(result.title).toBe("Fallback Title");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("Fallback Title");
  });

  it("degrades to title-only when rawJson is null for any ATS source", () => {
    for (const source of ["lever", "ashby", "unknown_ats"]) {
      const result = extractJobContent(source, null, "Engineer");
      expect(result.fullText).toBe("Engineer");
      expect(result.description).toBe("");
    }
  });
});

describe("extractJobUrl — G7 nullable rawJson", () => {
  it("returns null when rawJson is null", () => {
    expect(extractJobUrl("greenhouse", null)).toBeNull();
    expect(extractJobUrl("lever", null)).toBeNull();
    expect(extractJobUrl("ashby", null)).toBeNull();
  });
});

describe("extractJobMetadata — G7 nullable rawJson", () => {
  it("returns all-null metadata when rawJson is null", () => {
    const meta = extractJobMetadata("greenhouse", null);
    expect(meta.workplaceType).toBeNull();
    expect(meta.employmentType).toBeNull();
    expect(meta.locationName).toBeNull();
    expect(meta.companyName).toBeNull();
  });
});

describe("normalizeJob — G7 nullable rawJson", () => {
  const mockSummaryExtractor: LlmSummaryExtractor = async () =>
    "Mock summary for testing.";

  it("degrades to title-only when rawJson is null (rejected by title-only guard)", async () => {
    // normalizeJob with null rawJson → extractJobContent returns title-only
    // → title-only guard rejects (< 100 chars) → no LLM call needed
    const mockLlm = vi.fn(async () => []) as LlmTagExtractor;
    const result = await normalizeJob(
      "greenhouse",
      null,
      "Manager",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("title_only");
    expect(result.fullText).toBe("Manager");
    // LLM should not have been called (title-only guard short-circuits)
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("produces fullText that should be stored as normalizedText", async () => {
    // Verify that normalizeJob's fullText output is the cleaned text that
    // the handler writes to normalizedText (G7). This is the contract:
    //   DB update: normalizedText = normalization.fullText, rawJson = null
    // Content > 100 chars to pass the title-only guard.
    const rawJson = JSON.stringify({
      title: "Senior React Engineer",
      content:
        "<p>We need <strong>React</strong> and <em>TypeScript</em> developers. " +
        "You will build user interfaces with modern web technologies and " +
        "work on a fast-paced team delivering high-quality software.</p>",
    });
    const mockLlm: LlmTagExtractor = async () => ["react", "typescript"];
    const result = await normalizeJob(
      "greenhouse",
      rawJson,
      "Fallback",
      mockLlm,
      mockSummaryExtractor,
    );

    expect(result.status).toBe("normalized");
    // fullText is the HTML-stripped, cleaned text — this is what gets
    // written to normalizedText and what Gate 3 reads.
    expect(result.fullText).toContain("Senior React Engineer");
    expect(result.fullText).toContain("React");
    expect(result.fullText).toContain("TypeScript");
    // Verify it's significantly smaller than rawJson (G7 storage win)
    expect(result.fullText.length).toBeLessThan(rawJson.length);
  });
});

// =============================================================================
// F2: New ATS platform extraction (SmartRecruiters, Workable, Recruitee)
// CORPUS_EXPANSION_TDD §1.5
// =============================================================================

describe("extractJobContent — F2 SmartRecruiters", () => {
  // Sprint 4 Task 1: Tier 1 enrichment synthesizes a pseudo-description from
  // list-endpoint metadata (department, employment type, location, company)
  // to give the embedding more semantic surface area without extra API calls.
  it("extracts title from 'name' field (no description in list endpoint)", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Senior React Engineer",
      company: { name: "Acme" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.title).toBe("Senior React Engineer");
    expect(result.description).toBe(""); // List endpoint has no description
    // Tier 1 enrichment: company name is appended as "at Acme"
    expect(result.fullText).toBe("Senior React Engineer, at Acme");
  });

  it("degrades to fallback title when name is missing", () => {
    const rawJson = JSON.stringify({ id: "123" });
    const result = extractJobContent(
      "smartrecruiters",
      rawJson,
      "Fallback Title",
    );

    expect(result.title).toBe("Fallback Title");
    expect(result.fullText).toBe("Fallback Title");
  });

  // ── Tier 1 enrichment: metadata field synthesis ────────────────────────────
  it("synthesizes fullText from department, employment type, location, company", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Senior Backend Engineer",
      department: { label: "Engineering" },
      typeOfEmployment: { label: "Full-time" },
      location: { city: "Berlin", country: "Germany", remote: false },
      company: { name: "Acme Corp" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.title).toBe("Senior Backend Engineer");
    expect(result.description).toBe("");
    expect(result.fullText).toBe(
      "Senior Backend Engineer, Engineering department, Full-time, Berlin, Germany, at Acme Corp",
    );
  });

  it("appends 'Remote' when location.remote is true (overrides city/country)", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "DevOps Engineer",
      location: { city: "Lisbon", country: "Portugal", remote: true },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("DevOps Engineer, Remote");
  });

  it("appends city only when country is missing and not remote", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      location: { city: "Austin" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("Engineer, Austin");
  });

  it("omits location entirely when city/country/remote are all missing", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      department: { label: "Data" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("Engineer, Data department");
  });

  it("omits department when department.label is missing or empty", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      department: { label: "" },
      typeOfEmployment: { label: "Contract" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("Engineer, Contract");
  });

  it("omits employment type when typeOfEmployment.label is missing", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      typeOfEmployment: {},
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("Engineer");
  });

  it("omits company when company.name is missing or empty", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      company: { name: "" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.fullText).toBe("Engineer");
  });

  it("handles non-object department/location/company gracefully", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      department: "Engineering",
      location: null,
      company: "Acme",
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.title).toBe("Engineer");
    expect(result.fullText).toBe("Engineer");
  });

  // ── Tier 2 enrichment: jobAd.sections extraction (Sprint 4 Task 7) ────────
  it("extracts full description from jobAd.sections when present (Tier 2)", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Senior Engineer",
      jobAd: {
        sections: {
          jobDescription: {
            title: "Job Description",
            text: "We are looking for a senior engineer to build TypeScript applications.",
          },
          qualifications: {
            title: "Qualifications",
            text: "5+ years TypeScript, React, Node.js experience required.",
          },
          companyDescription: {
            title: "About Us",
            text: "Acme Corp builds developer tools.",
          },
        },
      },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.title).toBe("Senior Engineer");
    expect(result.description).toContain("TypeScript applications");
    expect(result.description).toContain("5+ years TypeScript");
    expect(result.description).toContain("Acme Corp builds developer tools");
    expect(result.fullText).toContain("Senior Engineer");
    expect(result.fullText).toContain("TypeScript applications");
  });

  it("falls back to Tier 1 when jobAd.sections is present but empty", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      jobAd: { sections: {} },
      department: { label: "Engineering" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.title).toBe("Engineer");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("Engineer, Engineering department");
  });

  it("falls back to Tier 1 when jobAd.sections text fields are all empty", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      jobAd: {
        sections: {
          jobDescription: { title: "Job Description", text: "" },
          qualifications: { title: "Qualifications", text: "" },
        },
      },
      department: { label: "Engineering" },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.description).toBe("");
    expect(result.fullText).toBe("Engineer, Engineering department");
  });

  it("strips HTML from jobAd.sections text", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      jobAd: {
        sections: {
          jobDescription: {
            title: "Job Description",
            text: "<p>We need <strong>TypeScript</strong> developers</p>",
          },
        },
      },
    });
    const result = extractJobContent("smartrecruiters", rawJson, "Fallback");

    expect(result.description).toBe("We need TypeScript developers");
  });
});

describe("extractJobContent — F2 Workable", () => {
  it("extracts title and strips HTML from description", () => {
    const rawJson = JSON.stringify({
      title: "Backend Developer",
      description: "<p>We need <strong>Node.js</strong> and PostgreSQL</p>",
    });
    const result = extractJobContent("workable", rawJson, "Fallback");

    expect(result.title).toBe("Backend Developer");
    expect(result.description).toBe("We need Node.js and PostgreSQL");
    expect(result.fullText).toBe(
      "Backend Developer We need Node.js and PostgreSQL",
    );
  });

  it("degrades to title-only when description is missing", () => {
    const rawJson = JSON.stringify({ title: "Engineer" });
    const result = extractJobContent("workable", rawJson, "Fallback");

    expect(result.title).toBe("Engineer");
    expect(result.description).toBe("");
    expect(result.fullText).toBe("Engineer");
  });
});

describe("extractJobContent — F2 Recruitee", () => {
  it("extracts title and combines description + requirements", () => {
    const rawJson = JSON.stringify({
      title: "DevOps Engineer",
      description: "We need Kubernetes expertise",
      requirements: "3+ years of DevOps",
    });
    const result = extractJobContent("recruitee", rawJson, "Fallback");

    expect(result.title).toBe("DevOps Engineer");
    expect(result.description).toContain("Kubernetes");
    expect(result.description).toContain("DevOps");
    expect(result.fullText).toContain("Kubernetes");
  });

  it("degrades to title-only when both description and requirements are missing", () => {
    const rawJson = JSON.stringify({ title: "Manager" });
    const result = extractJobContent("recruitee", rawJson, "Fallback");

    expect(result.title).toBe("Manager");
    expect(result.fullText).toBe("Manager");
  });
});

describe("extractJobMetadata — F2 SmartRecruiters", () => {
  it("extracts all metadata fields correctly", () => {
    const rawJson = JSON.stringify({
      id: "123",
      name: "Engineer",
      company: { name: "Acme Corp", identifier: "acme" },
      location: {
        city: "San Francisco",
        region: "CA",
        country: "us",
        remote: true,
      },
      department: { label: "Engineering" },
      typeOfEmployment: { label: "Full-time" },
      releasedDate: "2024-01-15T10:00:00Z",
    });
    const meta = extractJobMetadata("smartrecruiters", rawJson);

    expect(meta.companyName).toBe("Acme Corp");
    expect(meta.workplaceType).toBe("remote");
    expect(meta.employmentType).toBe("full-time");
    expect(meta.department).toBe("Engineering");
    expect(meta.locationName).toContain("San Francisco");
    expect(meta.publishedAt).toEqual(new Date("2024-01-15T10:00:00Z"));
  });

  it("returns nulls for missing fields", () => {
    const rawJson = JSON.stringify({ id: "123", name: "Engineer" });
    const meta = extractJobMetadata("smartrecruiters", rawJson);

    expect(meta.companyName).toBeNull();
    expect(meta.workplaceType).toBeNull();
    expect(meta.employmentType).toBeNull();
    expect(meta.department).toBeNull();
    expect(meta.locationName).toBeNull();
  });
});

describe("extractJobMetadata — F2 Workable", () => {
  it("extracts metadata with workplace type mapping", () => {
    const rawJson = JSON.stringify({
      title: "Engineer",
      workplace: "on_site",
      employmentType: "Full-time",
      department: "Engineering",
      companyName: "Acme",
      location: { city: "Berlin", country: "Germany" },
      publishedAt: "2024-01-15",
    });
    const meta = extractJobMetadata("workable", rawJson);

    expect(meta.workplaceType).toBe("on-site");
    expect(meta.employmentType).toBe("full-time");
    expect(meta.department).toBe("Engineering");
    expect(meta.companyName).toBe("Acme");
    expect(meta.locationName).toContain("Berlin");
  });

  it("maps hybrid workplace type", () => {
    const rawJson = JSON.stringify({ title: "Engineer", workplace: "hybrid" });
    const meta = extractJobMetadata("workable", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });
});

describe("extractJobMetadata — F2 Recruitee", () => {
  it("extracts metadata from boolean flags and locations array", () => {
    const rawJson = JSON.stringify({
      id: 1,
      title: "Engineer",
      company_name: "Acme Corp",
      department: "Engineering",
      remote: true,
      on_site: false,
      hybrid: false,
      employment_type_code: "fulltime_permanent",
      locations: [{ city: "Berlin", country: "Germany" }],
      careers_apply_url: "https://acme.recruitee.com/o/eng/apply",
      published_at: "2024-01-15 10:00:00 UTC",
    });
    const meta = extractJobMetadata("recruitee", rawJson);

    expect(meta.companyName).toBe("Acme Corp");
    expect(meta.workplaceType).toBe("remote");
    expect(meta.employmentType).toBe("full-time");
    expect(meta.department).toBe("Engineering");
    expect(meta.locationName).toContain("Berlin");
    expect(meta.applyUrl).toContain("apply");
  });

  it("maps hybrid from boolean flag", () => {
    const rawJson = JSON.stringify({
      id: 1,
      title: "Engineer",
      remote: false,
      hybrid: true,
      on_site: false,
    });
    const meta = extractJobMetadata("recruitee", rawJson);
    expect(meta.workplaceType).toBe("hybrid");
  });

  it("maps on_site from boolean flag", () => {
    const rawJson = JSON.stringify({
      id: 1,
      title: "Engineer",
      remote: false,
      hybrid: false,
      on_site: true,
    });
    const meta = extractJobMetadata("recruitee", rawJson);
    expect(meta.workplaceType).toBe("on-site");
  });
});

describe("extractJobUrl — F2 new ATS platforms", () => {
  it("extracts postingUrl from SmartRecruiters (detail endpoint only)", () => {
    const rawJson = JSON.stringify({
      postingUrl: "https://jobs.smartrecruiters.com/acme/123",
    });
    expect(extractJobUrl("smartrecruiters", rawJson)).toBe(
      "https://jobs.smartrecruiters.com/acme/123",
    );
  });

  it("returns null for SmartRecruiters list endpoint (no postingUrl)", () => {
    const rawJson = JSON.stringify({ id: "123", name: "Engineer" });
    expect(extractJobUrl("smartrecruiters", rawJson)).toBeNull();
  });

  it("extracts url from Workable", () => {
    const rawJson = JSON.stringify({
      url: "https://apply.workable.com/j/ABC123",
    });
    expect(extractJobUrl("workable", rawJson)).toBe(
      "https://apply.workable.com/j/ABC123",
    );
  });

  it("extracts careers_url from Recruitee", () => {
    const rawJson = JSON.stringify({
      careers_url: "https://acme.recruitee.com/o/devops-engineer",
    });
    expect(extractJobUrl("recruitee", rawJson)).toBe(
      "https://acme.recruitee.com/o/devops-engineer",
    );
  });
});

// =============================================================================
// G3: normalizeAggregatorJob — aggregator-sourced job normalization (§1.7)
// =============================================================================

describe("normalizeAggregatorJob — G3 (TDD §1.7)", () => {
  const baseJob: AggregatorJob = {
    source: "remoteok",
    externalJobId: "remoteok-12345",
    company: "Acme",
    title: "Senior Frontend Engineer",
    description:
      "We are looking for a React engineer with TypeScript experience.",
  };

  it("normalizes a valid engineering job", () => {
    const result = normalizeAggregatorJob(baseJob);

    expect(result.status).toBe("normalized");
    expect(result.fullText).toContain("Senior Frontend Engineer at Acme");
    expect(result.fullText).toContain("React engineer with TypeScript");
    // Should extract tags from the combined text
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.tags).toContain("react");
    expect(result.tags).toContain("typescript");
  });

  it("rejects non-engineering jobs via Gate 0", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      title: "Account Executive",
      description: "We need a salesperson to close deals.",
    });

    expect(result.status).toBe("rejected");
    // fullText is still populated (for audit/debugging)
    expect(result.fullText).toContain("Account Executive at Acme");
  });

  it("strips HTML from description", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      description: "<p>We need a <strong>React</strong> engineer.</p>",
    });

    expect(result.status).toBe("normalized");
    expect(result.fullText).not.toContain("<p>");
    expect(result.fullText).not.toContain("<strong>");
    expect(result.fullText).toContain("React engineer");
  });

  it("includes location in fullText when provided", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      location: "San Francisco, CA",
    });

    expect(result.fullText).toContain("San Francisco, CA");
  });

  it("omits location line when not provided", () => {
    const result = normalizeAggregatorJob(baseJob);

    // Should not have an empty line where location would be
    expect(result.fullText).toContain("Senior Frontend Engineer at Acme\n");
    expect(result.fullText).not.toContain("at Acme\n\n");
  });

  it("extracts tags from combined title + company + description text", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      title: "Backend Engineer",
      description: "Node.js, PostgreSQL, Docker, AWS. Must know Python.",
    });

    expect(result.status).toBe("normalized");
    expect(result.tags).toContain("nodejs");
    expect(result.tags).toContain("postgresql");
    expect(result.tags).toContain("docker");
    expect(result.tags).toContain("aws");
    expect(result.tags).toContain("python");
  });

  it("handles all aggregator source types", () => {
    const sources: AggregatorJob["source"][] = [
      "remoteok",
      "remotive",
      "himalayas",
      "wwr",
      "jobicy",
      "hn_comment",
      "reddit",
      "newsletter",
    ];

    for (const source of sources) {
      const result = normalizeAggregatorJob({
        ...baseJob,
        source,
        externalJobId: `${source}-001`,
      });

      expect(result.status).toBe("normalized");
    }
  });

  it("handles empty description", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      description: "",
    });

    expect(result.status).toBe("normalized");
    expect(result.fullText).toContain("Senior Frontend Engineer at Acme");
  });

  it("handles HTML-only description (strips to empty)", () => {
    const result = normalizeAggregatorJob({
      ...baseJob,
      description: "<div></div>",
    });

    expect(result.status).toBe("normalized");
    // Title still passes Gate 0
  });
});

// =============================================================================
// inferRemoteScope — Fix 1: remote + specific location → country_fenced
// =============================================================================

describe("inferRemoteScope — Fix 1: remote + specific location", () => {
  it("classifies remote + 'Pakistan' as country_fenced", () => {
    expect(inferRemoteScope("Pakistan", null, "remote")).toBe("country_fenced");
  });

  it("classifies remote + 'Pune, MH, in' as country_fenced", () => {
    expect(inferRemoteScope("Pune, MH, in", null, "remote")).toBe(
      "country_fenced",
    );
  });

  it("classifies remote + 'San Francisco, CA' as country_fenced", () => {
    expect(inferRemoteScope("San Francisco, CA", null, "remote")).toBe(
      "country_fenced",
    );
  });

  it("classifies remote + 'Delhi' as country_fenced", () => {
    expect(inferRemoteScope("Delhi", null, "remote")).toBe("country_fenced");
  });

  it("classifies remote + 'Spain' as country_fenced", () => {
    expect(inferRemoteScope("Spain", null, "remote")).toBe("country_fenced");
  });

  it("still classifies remote + 'Remote - Global' as global (explicit pattern wins)", () => {
    expect(inferRemoteScope("Remote - Global", null, "remote")).toBe("global");
  });

  it("still classifies remote + bare 'Remote' as global", () => {
    expect(inferRemoteScope("Remote", null, "remote")).toBe("global");
  });

  it("still classifies remote + 'Remote - US Only' as country_fenced (explicit pattern)", () => {
    expect(inferRemoteScope("Remote - US Only", null, "remote")).toBe(
      "country_fenced",
    );
  });

  it("classifies remote + 'European Union' as unknown (broad region, not specific)", () => {
    expect(inferRemoteScope("European Union", null, "remote")).toBe("unknown");
  });

  it("classifies remote + 'EMEA' as unknown (broad region)", () => {
    expect(inferRemoteScope("EMEA", null, "remote")).toBe("unknown");
  });

  it("classifies on-site as onsite regardless of location", () => {
    expect(inferRemoteScope("Pakistan", null, "on-site")).toBe("onsite");
  });

  it("classifies hybrid as onsite regardless of location", () => {
    expect(inferRemoteScope("Berlin, Germany", null, "hybrid")).toBe("onsite");
  });

  it("classifies remote + 'work from anywhere' in content as global (JD overrides location)", () => {
    expect(
      inferRemoteScope(
        "Pakistan",
        "We are a global team. Work from anywhere.",
        "remote",
      ),
    ).toBe("global");
  });

  it("classifies null workplace + specific location as unknown (not country_fenced)", () => {
    // Fix 1 only applies to remote jobs — null workplace is handled by Gate 0.5 Check 3
    expect(inferRemoteScope("Pakistan", null, null)).toBe("unknown");
  });

  it("classifies remote + null location as unknown", () => {
    expect(inferRemoteScope(null, null, "remote")).toBe("unknown");
  });

  it("classifies remote + empty location as unknown", () => {
    expect(inferRemoteScope("", null, "remote")).toBe("unknown");
  });

  // Fix 3: Country name in location string alongside "Remote"
  it("Fix 3: classifies remote + 'Poland / Remote / Poland' as country_fenced", () => {
    expect(
      inferRemoteScope(
        "Poland / Remote / Poland / Poland / Poland",
        null,
        "remote",
      ),
    ).toBe("country_fenced");
  });

  it("Fix 3: classifies remote + 'United States / Remote' as country_fenced", () => {
    expect(inferRemoteScope("United States / Remote", null, "remote")).toBe(
      "country_fenced",
    );
  });

  it("Fix 3: classifies remote + 'Germany / Remote / Germany' as country_fenced", () => {
    expect(inferRemoteScope("Germany / Remote / Germany", null, "remote")).toBe(
      "country_fenced",
    );
  });

  it("Fix 3: still classifies remote + 'Remote - Global' as global (no country name)", () => {
    expect(inferRemoteScope("Remote - Global", null, "remote")).toBe("global");
  });

  it("Fix 3: still classifies remote + bare 'Remote' as global (no country name)", () => {
    expect(inferRemoteScope("Remote", null, "remote")).toBe("global");
  });

  it("Fix 3: classifies remote + 'European Union' as unknown (broad region, not a country)", () => {
    expect(inferRemoteScope("European Union", null, "remote")).toBe("unknown");
  });
});
