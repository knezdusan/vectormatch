/**
 * Unit tests for the Direct Job Board Ingestion pipeline (WI3).
 *
 * Tests:
 *   - filter.ts: hasPersonaTechOverlap (keyword matching, word boundaries)
 *   - himalayas.ts: fetchHimalayasJobs (mocked fetch, pagination, filtering)
 *   - remoteok.ts: fetchRemoteOKJobs (mocked fetch, legal-notice skip, HTML strip)
 *
 * No real network calls are made — all fetch calls are mocked.
 */

import { describe, expect, it, vi } from "vitest";

// ── filter.ts tests ──────────────────────────────────────────────────────────

import {
  filterByPersonaTech,
  hasPersonaTechOverlap,
} from "@/lib/jobs/direct-ingestion/filter";

describe("hasPersonaTechOverlap", () => {
  it("matches React in tags", () => {
    expect(hasPersonaTechOverlap(["react", "aws"], "Backend Dev", "")).toBe(
      true,
    );
  });

  it("matches TypeScript in title", () => {
    expect(hasPersonaTechOverlap([], "Senior TypeScript Developer", "")).toBe(
      true,
    );
  });

  it("matches Vue in description", () => {
    expect(
      hasPersonaTechOverlap([], "Developer", "We use Vue.js for our frontend"),
    ).toBe(true);
  });

  it("matches PHP/Laravel", () => {
    expect(
      hasPersonaTechOverlap(["php", "laravel"], "Backend Engineer", ""),
    ).toBe(true);
  });

  it("matches Next.js variants", () => {
    expect(hasPersonaTechOverlap(["nextjs"], "Dev", "")).toBe(true);
    expect(hasPersonaTechOverlap(["next.js"], "Dev", "")).toBe(true);
    expect(hasPersonaTechOverlap([], "Next.js Developer", "")).toBe(true);
  });

  it("does NOT match backend-only tech stacks", () => {
    expect(
      hasPersonaTechOverlap(
        ["python", "django", "postgres"],
        "Backend Engineer",
        "",
      ),
    ).toBe(false);
    expect(
      hasPersonaTechOverlap(
        ["go", "kubernetes", "docker"],
        "DevOps Engineer",
        "",
      ),
    ).toBe(false);
    expect(
      hasPersonaTechOverlap(["java", "spring"], "Backend Developer", ""),
    ).toBe(false);
  });

  it("uses word boundaries for short keywords (ts, js)", () => {
    // "ts" should NOT match inside "assets"
    expect(hasPersonaTechOverlap([], "Assets Manager", "")).toBe(false);
    // "ts" SHOULD match as a standalone word
    expect(hasPersonaTechOverlap(["ts"], "Developer", "")).toBe(true);
    // "js" should NOT match inside "json"
    expect(hasPersonaTechOverlap([], "JSON Parser", "")).toBe(false);
    // "js" SHOULD match as a standalone word
    expect(hasPersonaTechOverlap(["js"], "Developer", "")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasPersonaTechOverlap(["REACT"], "DEV", "")).toBe(true);
    expect(hasPersonaTechOverlap(["TypeScript"], "dev", "")).toBe(true);
    expect(hasPersonaTechOverlap([], "FRONTEND DEVELOPER", "")).toBe(true);
  });

  it("matches frontend keyword", () => {
    expect(hasPersonaTechOverlap([], "Frontend Developer", "")).toBe(true);
    expect(hasPersonaTechOverlap([], "Front-end Developer", "")).toBe(true);
    expect(hasPersonaTechOverlap([], "Front end Developer", "")).toBe(true);
  });
});

describe("filterByPersonaTech", () => {
  it("filters out non-matching jobs", () => {
    const jobs = [
      { tags: ["react"], title: "Frontend Dev", description: "" },
      { tags: ["python"], title: "Backend Dev", description: "" },
      { tags: ["vue"], title: "Frontend Dev", description: "" },
      { tags: ["go"], title: "Backend Dev", description: "" },
    ];
    const filtered = filterByPersonaTech(jobs);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].tags).toEqual(["react"]);
    expect(filtered[1].tags).toEqual(["vue"]);
  });

  it("returns empty array when no jobs match", () => {
    const jobs = [
      { tags: ["python"], title: "Backend", description: "" },
      { tags: ["java"], title: "Backend", description: "" },
    ];
    expect(filterByPersonaTech(jobs)).toEqual([]);
  });

  it("returns all jobs when all match", () => {
    const jobs = [
      { tags: ["react"], title: "Dev", description: "" },
      { tags: ["php"], title: "Dev", description: "" },
    ];
    expect(filterByPersonaTech(jobs)).toHaveLength(2);
  });
});

// ── himalayas.ts tests ───────────────────────────────────────────────────────

import { fetchHimalayasJobs } from "@/lib/jobs/direct-ingestion/himalayas";

function mockFetchResponse(body: unknown, status = 200): typeof fetch {
  let callCount = 0;
  return vi.fn(async () => {
    callCount++;
    // First call returns the body; subsequent calls return empty (end pagination)
    const responseBody = callCount === 1 ? body : { totalCount: 0, jobs: [] };
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fetchHimalayasJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("parses valid Himalayas response and returns DirectIngestionJob[]", async () => {
    const mockResponse = {
      totalCount: 100,
      jobs: [
        {
          title: "Senior React Developer",
          companyName: "Acme",
          companySlug: "acme",
          jobSlug: "acme-senior-react-dev",
          excerpt: "Build React apps",
          tags: ["react", "typescript"],
          employmentType: "full-time",
          location: "Worldwide",
          minSalary: 80000,
          maxSalary: 120000,
          salaryCurrency: "USD",
          pubDate: "2026-07-01T00:00:00Z",
        },
      ],
    };

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchHimalayasJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return; // Type narrowing
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("Senior React Developer");
    expect(result.jobs[0].companyName).toBe("Acme");
    expect(result.jobs[0].extractedTags).toEqual(["react", "typescript"]);
    expect(result.jobs[0].workplaceType).toBe("remote");
    expect(result.jobs[0].remoteScope).toBe("global");
    expect(result.jobs[0].compensationMin).toBe(80000);
    expect(result.jobs[0].compensationMax).toBe(120000);
    expect(result.jobs[0].employmentType).toBe("full-time");
    expect(result.jobs[0].externalJobId).toBe("acme-senior-react-dev");
  });

  it("applies the tech filter and excludes non-matching jobs", async () => {
    const mockResponse = {
      totalCount: 2,
      jobs: [
        {
          title: "React Developer",
          companyName: "A",
          tags: ["react"],
          excerpt: "React frontend",
        },
        {
          title: "Python Backend",
          companyName: "B",
          tags: ["python", "django"],
          excerpt: "Django backend",
        },
      ],
    };

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchHimalayasJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("React Developer");
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = mockFetchResponse({ error: "Not found" }, 404);
    const result = await fetchHimalayasJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("404");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network timeout");
    }) as unknown as typeof fetch;
    const result = await fetchHimalayasJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Network timeout");
  });

  it("respects maxJobs limit", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({
      title: `React Dev ${i}`,
      companyName: "A",
      tags: ["react"],
      excerpt: "React",
    }));
    const fetchFn = mockFetchResponse({ totalCount: 10, jobs });
    const result = await fetchHimalayasJobs(3, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(3);
  });
});

// ── remoteok.ts tests ────────────────────────────────────────────────────────

import { fetchRemoteOKJobs } from "@/lib/jobs/direct-ingestion/remoteok";

describe("fetchRemoteOKJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("skips the legal notice (first element) and parses jobs", async () => {
    const mockResponse = [
      { legal: "API Terms of Service", last_updated: 1234567890 },
      {
        id: "1134548",
        position: "React Developer",
        company: "Acme",
        tags: ["react", "typescript"],
        description: "<p>Build <strong>React</strong> apps</p>",
        location: "Worldwide",
        salary_min: 80000,
        salary_max: 120000,
        salary_currency: "USD",
        apply_url: "https://remoteok.com/remote-jobs/123",
        date: "2026-07-06T15:08:08+00:00",
      },
    ];

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchRemoteOKJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("React Developer");
    expect(result.jobs[0].companyName).toBe("Acme");
    expect(result.jobs[0].extractedTags).toEqual(["react", "typescript"]);
    expect(result.jobs[0].workplaceType).toBe("remote");
    expect(result.jobs[0].remoteScope).toBe("global");
    expect(result.jobs[0].externalJobId).toBe("1134548");
  });

  it("strips HTML from description", async () => {
    const mockResponse = [
      { legal: "notice" },
      {
        id: "1",
        position: "Dev",
        company: "A",
        tags: ["react"],
        description:
          "<p>Hello <strong>world</strong></p><ul><li>item</li></ul>",
      },
    ];

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchRemoteOKJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].normalizedText).toBe("Hello world\nitem");
  });

  it("applies the tech filter", async () => {
    const mockResponse = [
      { legal: "notice" },
      {
        id: "1",
        position: "React Dev",
        company: "A",
        tags: ["react"],
        description: "",
      },
      {
        id: "2",
        position: "Python Dev",
        company: "B",
        tags: ["python"],
        description: "",
      },
    ];

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchRemoteOKJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("React Dev");
  });

  it("handles missing salary fields (salary_min=0)", async () => {
    const mockResponse = [
      { legal: "notice" },
      {
        id: "1",
        position: "Dev",
        company: "A",
        tags: ["react"],
        description: "",
        salary_min: 0,
        salary_max: 0,
      },
    ];

    const fetchFn = mockFetchResponse(mockResponse);
    const result = await fetchRemoteOKJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].compensationMin).toBeNull();
    expect(result.jobs[0].compensationMax).toBeNull();
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = mockFetchResponse({ error: "Server error" }, 500);
    const result = await fetchRemoteOKJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("500");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchRemoteOKJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Connection refused");
  });
});

// ── nofluffjobs.ts tests ─────────────────────────────────────────────────────

import { fetchNoFluffJobs } from "@/lib/jobs/direct-ingestion/nofluffjobs";

/** Mock fetch returning a single JSON body (NoFluffJobs has no pagination). */
function mockNoFluffFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** A representative NoFluffJobs posting used across tests. */
function samplePosting(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "senior-vue-js-engineer-n-ix-remote",
    name: "N-iX",
    title: "Senior Vue.js Engineer",
    technology: "Vue.js",
    category: "frontend",
    seniority: ["Senior"],
    fullyRemote: false, // Top-level — UNRELIABLE, must be ignored
    location: {
      fullyRemote: true, // THIS is the correct remote indicator
      places: [
        { country: { code: "POL", name: "Poland" }, city: "Warszawa" },
        { country: { code: "ESP", name: "Spain" }, city: "Madryt" },
      ],
    },
    salary: {
      from: 5880,
      to: 6552,
      type: "b2b",
      currency: "USD",
    },
    url: "senior-vue-js-engineer-n-ix-remote",
    posted: 1781870594403,
    tiles: {
      values: [
        { value: "frontend", type: "category" },
        { value: "Vue.js", type: "requirement" },
        { value: "Nuxt.js", type: "requirement" },
        { value: "C#", type: "requirement" },
      ],
    },
    ...overrides,
  };
}

describe("fetchNoFluffJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("parses a valid remote posting and maps all fields", async () => {
    const mockResponse = {
      totalCount: 1,
      postings: [samplePosting()],
    };

    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.title).toBe("Senior Vue.js Engineer");
    expect(job.companyName).toBe("N-iX");
    expect(job.externalJobId).toBe("senior-vue-js-engineer-n-ix-remote");
    expect(job.workplaceType).toBe("remote");
    expect(job.remoteScope).toBe("global");
    // Tags: technology + requirement-type tiles, lowercased + deduped
    expect(job.extractedTags).toEqual(["vue.js", "nuxt.js", "c#"]);
    // Apply URL prefixed with the NoFluffJobs job path
    expect(job.applyUrl).toBe(
      "https://nofluffjobs.com/job/senior-vue-js-engineer-n-ix-remote",
    );
    // Location formatted from places
    expect(job.locationName).toBe("Warszawa, Poland / Madryt, Spain");
    // publishedAt from epoch ms
    expect(job.publishedAt).toEqual(new Date(1781870594403));
  });

  it("converts monthly salary to annual (×12)", async () => {
    const mockResponse = {
      totalCount: 1,
      postings: [samplePosting()],
    };

    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // 5880/mo → 70560/yr ; 6552/mo → 78624/yr
    expect(result.jobs[0].compensationMin).toBe(70560);
    expect(result.jobs[0].compensationMax).toBe(78624);
    expect(result.jobs[0].compensationCurrency).toBe("USD");
  });

  it("maps seniority to experience year ranges", async () => {
    const cases: Array<{ seniority: string[]; min: number; max: number }> = [
      { seniority: ["Junior"], min: 0, max: 2 },
      { seniority: ["Mid"], min: 3, max: 5 },
      { seniority: ["Senior"], min: 5, max: 8 },
      { seniority: ["Expert"], min: 8, max: 15 },
    ];

    for (const c of cases) {
      const mockResponse = {
        totalCount: 1,
        postings: [samplePosting({ seniority: c.seniority })],
      };
      const fetchFn = mockNoFluffFetch(mockResponse);
      const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.jobs[0].experienceMinYears).toBe(c.min);
      expect(result.jobs[0].experienceMaxYears).toBe(c.max);
    }
  });

  it("maps employment types (b2b→contract, permanent→full-time, zlecenie→contract, uod→contract)", async () => {
    const cases: Array<{ type: string; expected: string }> = [
      { type: "b2b", expected: "contract" },
      { type: "permanent", expected: "full-time" },
      { type: "zlecenie", expected: "contract" },
      { type: "uod", expected: "contract" },
    ];

    for (const c of cases) {
      const mockResponse = {
        totalCount: 1,
        postings: [
          samplePosting({
            salary: { from: 5000, to: 6000, type: c.type, currency: "PLN" },
          }),
        ],
      };
      const fetchFn = mockNoFluffFetch(mockResponse);
      const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.jobs[0].employmentType).toBe(c.expected);
    }
  });

  it("skips non-remote jobs (location.fullyRemote === false)", async () => {
    const mockResponse = {
      totalCount: 2,
      postings: [
        samplePosting({ id: "remote-1" }),
        samplePosting({
          id: "hybrid-1",
          location: {
            fullyRemote: false,
            places: [{ city: "Berlin", country: { name: "Germany" } }],
          },
        }),
      ],
    };

    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalJobId).toBe("remote-1");
  });

  it("ignores the stale top-level fullyRemote field and uses location.fullyRemote", async () => {
    // Top-level fullyRemote=true but location.fullyRemote=false → must be skipped
    const mockResponse = {
      totalCount: 1,
      postings: [
        samplePosting({
          id: "stale-1",
          fullyRemote: true,
          location: { fullyRemote: false, places: [] },
        }),
      ],
    };

    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(0);
  });

  it("applies the persona tech filter", async () => {
    const mockResponse = {
      totalCount: 2,
      postings: [
        samplePosting({
          id: "vue-1",
          title: "Vue.js Developer",
          technology: "Vue.js",
        }),
        samplePosting({
          id: "backend-1",
          title: "Java Backend Engineer",
          technology: "Java",
          category: "backend",
          tiles: {
            values: [
              { value: "java", type: "requirement" },
              { value: "spring", type: "requirement" },
            ],
          },
        }),
      ],
    };

    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalJobId).toBe("vue-1");
  });

  it("respects maxJobs limit", async () => {
    const postings = Array.from({ length: 10 }, (_, i) =>
      samplePosting({ id: `job-${i}`, title: `React Dev ${i}` }),
    );
    const mockResponse = { totalCount: 10, postings };
    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(3, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(3);
  });

  it("handles missing salary fields gracefully", async () => {
    const mockResponse = {
      totalCount: 1,
      postings: [samplePosting({ salary: undefined })],
    };
    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].compensationMin).toBeNull();
    expect(result.jobs[0].compensationMax).toBeNull();
    expect(result.jobs[0].compensationCurrency).toBeNull();
    expect(result.jobs[0].employmentType).toBeNull();
  });

  it("rejects zero/negative salary values", async () => {
    const mockResponse = {
      totalCount: 1,
      postings: [
        samplePosting({
          salary: { from: 0, to: -5, type: "b2b", currency: "PLN" },
        }),
      ],
    };
    const fetchFn = mockNoFluffFetch(mockResponse);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].compensationMin).toBeNull();
    expect(result.jobs[0].compensationMax).toBeNull();
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = mockNoFluffFetch({ error: "Server error" }, 500);
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("500");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchNoFluffJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Connection refused");
  });
});

// ── arbeitnow.ts tests ───────────────────────────────────────────────────────

import { fetchArbeitnowJobs } from "@/lib/jobs/direct-ingestion/arbeitnow";

/**
 * Mock fetch that returns paginated Arbeitnow responses.
 * `pages` is an array where each element is the `data` array for that page.
 * An empty array (or running out of pages) signals end-of-data.
 */
function mockArbeitnowFetch(pages: unknown[][]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const pageMatch = url.match(/page=(\d+)/);
    const pageNum = pageMatch ? Number(pageMatch[1]) : 1;
    // Index by page number (1-based); empty/missing → empty data (end of data)
    const data = pages[pageNum - 1] ?? [];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fetchArbeitnowJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("parses a valid Arbeitnow job and maps all fields", async () => {
    const pages = [
      [
        {
          slug: "react-developer-acme-remote-123",
          company_name: "Acme",
          title: "React Developer",
          description: "<p>Build <strong>React</strong> apps</p>",
          remote: true,
          url: "https://arbeitnow.com/jobs/react-developer-acme-123",
          tags: ["React", "TypeScript"],
          job_types: ["full_time"],
          location: "Berlin, Germany",
          created_at: "2026-07-05T10:00:00Z",
        },
      ],
    ];

    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.title).toBe("React Developer");
    expect(job.companyName).toBe("Acme");
    expect(job.externalJobId).toBe("react-developer-acme-remote-123");
    expect(job.extractedTags).toEqual(["react", "typescript"]);
    expect(job.workplaceType).toBe("remote");
    expect(job.remoteScope).toBe("global");
    expect(job.applyUrl).toBe(
      "https://arbeitnow.com/jobs/react-developer-acme-123",
    );
    expect(job.locationName).toBe("Berlin, Germany");
    expect(job.employmentType).toBe("full-time");
    expect(job.publishedAt).toEqual(new Date("2026-07-05T10:00:00Z"));
    // Arbeitnow has no structured salary
    expect(job.compensationMin).toBeNull();
    expect(job.compensationMax).toBeNull();
  });

  it("strips HTML from description", async () => {
    const pages = [
      [
        {
          slug: "job-1",
          title: "Dev",
          description:
            "<p>Hello <strong>world</strong></p><ul><li>item</li></ul>",
          remote: true,
          tags: ["react"],
        },
      ],
    ];
    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].normalizedText).toBe("Hello world\nitem");
  });

  it("applies the persona tech filter", async () => {
    const pages = [
      [
        {
          slug: "a",
          title: "React Dev",
          tags: ["react"],
          remote: true,
          description: "",
        },
        {
          slug: "b",
          title: "Marketing Lead",
          tags: ["seo"],
          remote: true,
          description: "",
        },
      ],
    ];
    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalJobId).toBe("a");
  });

  it("marks non-remote jobs with workplaceType=null and remoteScope=unknown", async () => {
    const pages = [
      [
        {
          slug: "onsite",
          title: "React Dev",
          tags: ["react"],
          remote: false,
          description: "",
        },
      ],
    ];
    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].workplaceType).toBeNull();
    expect(result.jobs[0].remoteScope).toBe("unknown");
  });

  it("paginates via ?page=N and stops on empty page", async () => {
    const pages = [
      [
        {
          slug: "p1-1",
          title: "React Dev",
          tags: ["react"],
          remote: true,
          description: "",
        },
      ],
      [
        {
          slug: "p2-1",
          title: "Vue Dev",
          tags: ["vue"],
          remote: true,
          description: "",
        },
      ],
      [], // empty page → stop
    ];
    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0].externalJobId).toBe("p1-1");
    expect(result.jobs[1].externalJobId).toBe("p2-1");
  });

  it("respects maxJobs limit across pages", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      slug: `job-${i}`,
      title: `React Dev ${i}`,
      tags: ["react"],
      remote: true,
      description: "",
    }));
    const pages = [page1, []];
    const fetchFn = mockArbeitnowFetch(pages);
    const result = await fetchArbeitnowJobs(5, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(5);
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("500");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchArbeitnowJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Connection refused");
  });
});

// ── remotive.ts tests ────────────────────────────────────────────────────────

import { fetchRemotiveJobs } from "@/lib/jobs/direct-ingestion/remotive";

/** Mock fetch returning a single Remotive JSON body. */
function mockRemotiveFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fetchRemotiveJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("parses a valid Remotive job and maps all fields", async () => {
    const mockResponse = {
      "job-count": 1,
      "total-job-count": 1,
      jobs: [
        {
          id: 1185979,
          url: "https://remotive.com/remote-jobs/react-developer-1185979",
          title: "React Developer",
          company_name: "Acme",
          category: "Software Development",
          tags: ["React", "TypeScript"],
          job_type: "full_time",
          publication_date: "2026-07-04T12:00:00+00:00",
          candidate_required_location: "Anywhere in the World",
          salary: "$50-$75 /hour",
          description: "<p>Build <strong>React</strong> apps</p>",
        },
      ],
    };

    const fetchFn = mockRemotiveFetch(mockResponse);
    const result = await fetchRemotiveJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.title).toBe("React Developer");
    expect(job.companyName).toBe("Acme");
    expect(job.externalJobId).toBe("1185979");
    expect(job.extractedTags).toEqual(["react", "typescript"]);
    expect(job.workplaceType).toBe("remote");
    expect(job.remoteScope).toBe("global");
    expect(job.employmentType).toBe("full-time");
    expect(job.applyUrl).toBe(
      "https://remotive.com/remote-jobs/react-developer-1185979",
    );
    expect(job.locationName).toBe("Anywhere in the World");
    expect(job.publishedAt).toEqual(new Date("2026-07-04T12:00:00+00:00"));
    // Remotive salary is free text — not parsed into structured fields
    expect(job.compensationMin).toBeNull();
    expect(job.compensationMax).toBeNull();
  });

  it("strips HTML from description", async () => {
    const mockResponse = {
      "job-count": 1,
      jobs: [
        {
          id: 1,
          title: "Dev",
          tags: ["react"],
          description:
            "<p>Hello <strong>world</strong></p><ul><li>item</li></ul>",
        },
      ],
    };
    const fetchFn = mockRemotiveFetch(mockResponse);
    const result = await fetchRemotiveJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].normalizedText).toBe("Hello world\nitem");
  });

  it("applies the persona tech filter", async () => {
    const mockResponse = {
      "job-count": 2,
      jobs: [
        { id: 1, title: "React Dev", tags: ["react"], description: "" },
        { id: 2, title: "Sales Lead", tags: ["sales"], description: "" },
      ],
    };
    const fetchFn = mockRemotiveFetch(mockResponse);
    const result = await fetchRemotiveJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalJobId).toBe("1");
  });

  it("marks country-specific locations as country_fenced", async () => {
    const mockResponse = {
      "job-count": 1,
      jobs: [
        {
          id: 1,
          title: "React Dev",
          tags: ["react"],
          description: "",
          candidate_required_location: "USA only",
        },
      ],
    };
    const fetchFn = mockRemotiveFetch(mockResponse);
    const result = await fetchRemotiveJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].remoteScope).toBe("country_fenced");
  });

  it("respects maxJobs limit", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      title: `React Dev ${i}`,
      tags: ["react"],
      description: "",
    }));
    const mockResponse = { "job-count": 10, jobs };
    const fetchFn = mockRemotiveFetch(mockResponse);
    const result = await fetchRemotiveJobs(3, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(3);
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = mockRemotiveFetch({ error: "Server error" }, 500);
    const result = await fetchRemotiveJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("500");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchRemotiveJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Connection refused");
  });
});

// ── weworkremotely.ts tests ──────────────────────────────────────────────────

import { fetchWeWorkRemotelyJobs } from "@/lib/jobs/direct-ingestion/weworkremotely";

/** Build a minimal WWR RSS XML string from an array of item objects. */
function buildRssXml(items: Array<Record<string, string>>): string {
  const itemBlocks = items
    .map(
      (it) => `<item>
      <title>${it.title ?? ""}</title>
      <region>${it.region ?? ""}</region>
      <category>${it.category ?? ""}</category>
      <type>${it.type ?? ""}</type>
      <link>${it.link ?? ""}</link>
      <pubDate>${it.pubDate ?? ""}</pubDate>
      <description>${it.description ?? ""}</description>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    ${itemBlocks}
  </channel>
</rss>`;
}

/** Mock fetch returning RSS XML. */
function mockWwrFetch(xml: string, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(xml, {
      status,
      headers: { "Content-Type": "application/rss+xml" },
    });
  }) as unknown as typeof fetch;
}

describe("fetchWeWorkRemotelyJobs", () => {
  const allPassFilter = () => true;
  const personaFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

  it("parses a valid WWR item and maps all fields", async () => {
    const xml = buildRssXml([
      {
        title: "Acme: Senior React Engineer",
        region: "Anywhere in the World",
        category: "Front-End Programming",
        type: "Full-Time",
        link: "https://weworkremotely.com/remote-jobs/acme-senior-react-engineer",
        pubDate: "Tue, 07 Jul 2026 12:49:42 +0000",
        description:
          "&lt;p&gt;Build &lt;strong&gt;React&lt;/strong&gt; apps&lt;/p&gt;",
      },
    ]);

    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.title).toBe("Senior React Engineer");
    expect(job.companyName).toBe("Acme");
    expect(job.externalJobId).toBe("acme-senior-react-engineer");
    expect(job.applyUrl).toBe(
      "https://weworkremotely.com/remote-jobs/acme-senior-react-engineer",
    );
    expect(job.workplaceType).toBe("remote");
    expect(job.remoteScope).toBe("global");
    expect(job.employmentType).toBe("full-time");
    expect(job.locationName).toBe("Anywhere in the World");
    expect(job.publishedAt).toEqual(
      new Date("Tue, 07 Jul 2026 12:49:42 +0000"),
    );
    // Category mapped to frontend tag
    expect(job.extractedTags).toEqual(["frontend"]);
  });

  it("unescapes XML entities then strips HTML from description", async () => {
    const xml = buildRssXml([
      {
        title: "Acme: Dev",
        category: "Front-End Programming",
        description:
          "&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;item&lt;/li&gt;&lt;/ul&gt;",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].normalizedText).toBe("Hello world\nitem");
  });

  it("splits 'Company: Role' title on the first colon", async () => {
    const xml = buildRssXml([
      {
        title: "Vidalytics: AI Automation Engineer, In-House MarTech",
        category: "Front-End Programming",
        description: "",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].companyName).toBe("Vidalytics");
    expect(result.jobs[0].title).toBe(
      "AI Automation Engineer, In-House MarTech",
    );
  });

  it("handles titles with no colon (company null)", async () => {
    const xml = buildRssXml([
      {
        title: "Anonymous Frontend Developer",
        category: "Front-End Programming",
        description: "",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].companyName).toBeNull();
    expect(result.jobs[0].title).toBe("Anonymous Frontend Developer");
  });

  it("maps Full-Stack category to frontend+backend tags", async () => {
    const xml = buildRssXml([
      {
        title: "Acme: Full Stack Dev",
        category: "Full-Stack Programming",
        description: "",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].extractedTags).toEqual(["frontend", "backend"]);
  });

  it("applies the persona tech filter (frontend passes, marketing filtered)", async () => {
    const xml = buildRssXml([
      {
        title: "Acme: React Dev",
        category: "Front-End Programming",
        description: "",
      },
      {
        title: "Acme: Sales Lead",
        category: "Sales and Marketing",
        description: "",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, personaFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("React Dev");
  });

  it("marks non-Anywhere regions as country_fenced", async () => {
    const xml = buildRssXml([
      {
        title: "Acme: React Dev",
        category: "Front-End Programming",
        region: "USA Only",
        description: "",
      },
    ]);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].remoteScope).toBe("country_fenced");
  });

  it("respects maxJobs limit", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `Acme: React Dev ${i}`,
      category: "Front-End Programming",
      description: "",
    }));
    const xml = buildRssXml(items);
    const fetchFn = mockWwrFetch(xml);
    const result = await fetchWeWorkRemotelyJobs(3, allPassFilter, fetchFn);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(3);
  });

  it("returns error on HTTP failure", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }) as unknown as typeof fetch;
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("500");
  });

  it("returns error on network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchWeWorkRemotelyJobs(100, allPassFilter, fetchFn);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Connection refused");
  });
});
