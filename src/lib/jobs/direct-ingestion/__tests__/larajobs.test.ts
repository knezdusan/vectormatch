import { describe, expect, it, vi } from "vitest";
import { fetchLaraJobsJobs } from "@/lib/jobs/direct-ingestion/larajobs";

// Mock HTML for the LaraJobs main page
const MOCK_MAIN_PAGE = `
<html>
<body>
<a href="/job/3905">Senior Laravel Engineer</a>
<div>HelpBnk</div>
<div>Contractor</div>
<div>Remote / Europe</div>
<div>2d</div>
<a href="/mysql-jobs">MySQL</a>
<a href="/php-jobs">PHP</a>
<a href="/react-jobs">React</a>
<a href="/redis-jobs">Redis</a>

<a href="/job/3904">Full-Stack Developer (Laravel + Inertia/Vue)</a>
<div>Greenwood Capital</div>
<div>Full Time - £60k-£70k</div>
<div>Remote/Hybrid, Manchester, UK</div>
<div>5d</div>
<a href="/api-jobs">API</a>
<a href="/fullstack-jobs">Fullstack</a>
<a href="/laravel-jobs">Laravel</a>
<a href="/tailwindcss-jobs">TailwindCSS</a>
<a href="/vuejs-jobs">VueJS</a>

<a href="/job/3899">Laravel & Wordpress Web Developer</a>
<div>Southeastern University</div>
<div>Full Time</div>
<div>Lakeland, FL</div>
<div>2w</div>
<a href="/laravel-jobs">Laravel</a>
<a href="/php-jobs">PHP</a>
<a href="/wordpress-jobs">WordPress</a>
</body>
</html>
`;

const MOCK_JOB_PAGE = `
<html>
<body>
<h1>Senior Laravel Engineer</h1>
<p>We are looking for a Senior Laravel Engineer to join our team.</p>
<p>Requirements: PHP, Laravel, MySQL, Redis, React experience.</p>
<p>Remote position within Europe.</p>
<div>15 Jul, 2026</div>
</body>
</html>
`;

// Mock fetch that returns different responses based on URL
function createMockFetch(): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr === "https://larajobs.com") {
      return new Response(MOCK_MAIN_PAGE, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
    if (urlStr.startsWith("https://larajobs.com/job/")) {
      return new Response(MOCK_JOB_PAGE, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;
}

// Tech filter that accepts PHP/Laravel jobs
const phpTechFilter = (job: {
  tags: string[];
  title: string;
  description: string;
}) => {
  return job.tags.some((t) =>
    [
      "php",
      "laravel",
      "wordpress",
      "mysql",
      "vuejs",
      "react",
      "redis",
    ].includes(t),
  );
};

// Tech filter that rejects everything
const rejectAllFilter = () => false;

describe("LaraJobs adapter", () => {
  it("fetches and parses job cards from the main page", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.totalAvailable).toBe(3); // 3 job cards in mock
    }
  });

  it("extracts job titles correctly", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      const titles = result.jobs.map((j) => j.title);
      expect(titles.some((t) => t.includes("Laravel"))).toBe(true);
    }
  });

  it("infers remote scope from location", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      // "Remote / Europe" → region_fenced
      const europeJob = result.jobs.find((j) =>
        j.locationName?.toLowerCase().includes("europe"),
      );
      expect(europeJob?.remoteScope).toBe("region_fenced");

      // "Lakeland, FL" → onsite (specific city, no remote indicator)
      const onsiteJob = result.jobs.find((j) =>
        j.locationName?.includes("Lakeland"),
      );
      expect(onsiteJob?.remoteScope).toBe("onsite");

      // "Remote/Hybrid, Manchester, UK" → country_fenced (hybrid = physical presence)
      const hybridJob = result.jobs.find((j) =>
        j.locationName?.toLowerCase().includes("hybrid"),
      );
      expect(hybridJob?.remoteScope).toBe("country_fenced");
    }
  });

  it("extracts tags from job cards and merges with scanTagsRegex", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      const laravelJob = result.jobs.find((j) =>
        j.title?.toLowerCase().includes("laravel"),
      );
      expect(laravelJob).toBeDefined();
      expect(laravelJob?.extractedTags).toContain("laravel");
      expect(laravelJob?.extractedTags).toContain("php");
    }
  });

  it("respects the tech filter — rejects non-matching jobs", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, rejectAllFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs.length).toBe(0);
    }
  });

  it("respects maxJobs limit", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(1, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs.length).toBe(1);
    }
  });

  it("handles HTTP errors gracefully", async () => {
    const errorFetch = vi.fn(async () => {
      return new Response("Server error", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await fetchLaraJobsJobs(50, phpTechFilter, errorFetch);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("500");
    }
  });

  it("parses salary from metadata", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      // The Greenwood Capital job has "£60k-£70k"
      const salaryJob = result.jobs.find((j) => j.compensationMax !== null);
      if (salaryJob) {
        expect(salaryJob.compensationMax).toBeGreaterThan(0);
      }
    }
  });

  it("sets workplaceType to remote for remote jobs", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      const remoteJob = result.jobs.find((j) =>
        j.locationName?.toLowerCase().includes("remote"),
      );
      expect(remoteJob?.workplaceType).toBe("remote");
    }
  });

  it("fetches job description from individual job pages", async () => {
    const mockFetch = createMockFetch();
    const result = await fetchLaraJobsJobs(50, phpTechFilter, mockFetch);

    expect(result.success).toBe(true);
    if (result.success) {
      // All jobs should have a non-empty description from the job page fetch
      for (const job of result.jobs) {
        expect(job.normalizedText.length).toBeGreaterThan(0);
      }
    }
  });
});
