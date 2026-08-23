import { describe, expect, it, vi } from "vitest";
import { fetchJobicyJobs } from "@/lib/jobs/direct-ingestion/jobicy";

const MOCK_API_RESPONSE = JSON.stringify({
  apiVersion: "2.2.15",
  jobCount: 2,
  jobs: [
    {
      id: 150851,
      url: "https://jobicy.com/jobs/150851-senior-react-engineer",
      jobSlug: "150851-senior-react-engineer",
      jobTitle: "Senior React Engineer",
      companyName: "TestCorp",
      jobIndustry: ["Software Engineering"],
      jobType: ["Full-Time"],
      jobGeo: "Worldwide",
      jobLevel: "Senior",
      jobExcerpt: "We are looking for a Senior React Engineer.",
      jobDescription:
        "<p>We are looking for a Senior React Engineer to join our team.</p><p>Requirements: React, TypeScript, Next.js, Node.js</p>",
      pubDate: "2026-08-16T16:32:48+00:00",
      salaryMin: 100000,
      salaryMax: 150000,
      salaryCurrency: "USD",
      salaryPeriod: "yearly",
    },
    {
      id: 150850,
      url: "https://jobicy.com/jobs/150850-php-developer",
      jobSlug: "150850-php-developer",
      jobTitle: "PHP Developer",
      companyName: "AnotherCorp",
      jobIndustry: ["Software Engineering"],
      jobType: ["Full-Time"],
      jobGeo: "USA",
      jobLevel: "Mid",
      jobExcerpt: "PHP Developer with Laravel experience.",
      jobDescription:
        "<p>PHP Developer with Laravel experience. Must know PHP, Laravel, MySQL.</p>",
      pubDate: "2026-08-16T14:52:01+00:00",
    },
  ],
});

function createMockFetch(): typeof fetch {
  return vi.fn(async () => {
    return new Response(MOCK_API_RESPONSE, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fetchJobicyJobs", () => {
  it("fetches and parses jobs from the Jobicy API", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0].title).toBe("Senior React Engineer");
    expect(result.jobs[0].companyName).toBe("TestCorp");
    expect(result.jobs[0].externalJobId).toBe("150851");
  });

  it("extracts tags from the job description", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The first job mentions React, TypeScript, Next.js, Node.js
    expect(result.jobs[0].extractedTags).toContain("react");
    expect(result.jobs[0].extractedTags).toContain("typescript");
    expect(result.jobs[0].extractedTags).toContain("nextjs");
  });

  it("sets remoteScope to global for Worldwide geo", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].remoteScope).toBe("global");
  });

  it("sets remoteScope to country_fenced for USA geo", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[1].remoteScope).toBe("country_fenced");
    expect(result.jobs[1].locationName).toBe("USA");
  });

  it("sets workplaceType to remote for all jobs", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].workplaceType).toBe("remote");
    expect(result.jobs[1].workplaceType).toBe("remote");
  });

  it("applies tech filter when provided", async () => {
    // Filter that only accepts jobs with PHP tags
    const phpFilter = (job: { tags: string[] }) =>
      job.tags.some((t) => t === "php" || t === "laravel");
    const result = await fetchJobicyJobs(100, phpFilter, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("PHP Developer");
  });

  it("handles API error gracefully", async () => {
    const errorFetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as unknown as typeof fetch;
    const result = await fetchJobicyJobs(100, undefined, errorFetch);
    expect(result.success).toBe(false);
  });

  it("handles empty jobs array", async () => {
    const emptyResponse = JSON.stringify({
      apiVersion: "2.2.15",
      jobCount: 0,
      jobs: [],
    });
    const emptyFetch = vi.fn(async () => {
      return new Response(emptyResponse, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const result = await fetchJobicyJobs(100, undefined, emptyFetch);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs).toHaveLength(0);
  });

  it("sets compensation fields from salary data", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.jobs[0].compensationMin).toBe(100000);
    expect(result.jobs[0].compensationMax).toBe(150000);
    expect(result.jobs[0].compensationCurrency).toBe("USD");
  });

  it("handles missing salary data", async () => {
    const result = await fetchJobicyJobs(100, undefined, createMockFetch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Second job has no salary data
    expect(result.jobs[1].compensationMin).toBe(null);
    expect(result.jobs[1].compensationMax).toBe(null);
    expect(result.jobs[1].compensationCurrency).toBe(null);
  });
});
