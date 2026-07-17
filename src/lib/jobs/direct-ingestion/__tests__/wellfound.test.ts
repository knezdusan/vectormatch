// Tests for the Wellfound direct-ingestion adapter
// src/lib/jobs/direct-ingestion/__tests__/wellfound.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock playwright before importing the adapter
vi.mock("playwright", () => {
  const mockPage = {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    evaluate: vi.fn(),
  };
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
  };
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

// Mock scanTagsRegex to avoid loading the full job-normalizer (which imports server-only)
vi.mock("../../job-normalizer", () => ({
  scanTagsRegex: (text: string) => {
    const tags: string[] = [];
    const lower = text.toLowerCase();
    if (/\breact\b/i.test(text)) tags.push("react");
    if (/\btypescript\b/i.test(text)) tags.push("typescript");
    if (/\bnode\.?js\b/i.test(text)) tags.push("nodejs");
    if (/\bvue\b/i.test(text)) tags.push("vue");
    if (/\bpython\b/i.test(text)) tags.push("python");
    if (/\bruby\b/i.test(text)) tags.push("ruby");
    if (/\brails\b/i.test(text)) tags.push("rails");
    return tags;
  },
}));

import { fetchWellfoundJobs } from "../wellfound";

// Type narrowing helper for discriminated union results
function expectSuccess(r: any): { jobs: any[]; employers?: any[] } {
  expect(r.success).toBe(true);
  return r;
}
function expectFailure(r: any): { error: string } {
  expect(r.success).toBe(false);
  return r;
}

// Get the mocked page object so we can control evaluate responses
const playwright = await import("playwright");
const mockBrowser = playwright.chromium;
const mockPage = (await (mockBrowser.launch as any)()).newContext().then((c: any) => c.newPage());

describe("Wellfound adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result when page has no job cards", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([]);

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toEqual([]);
  });

  it("parses job cards into DirectIngestionJob objects", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "TestCo",
        companyHref: "/company/testco",
        description: "Building AI tools",
        size: "11-50 Employees",
        jobs: [
          {
            title: "Senior React Engineer",
            href: "/jobs/123-senior-react-engineer",
            jobText:
              "Senior React EngineerFull-time$120k – $160k • 0.5% – 2.0%Remote only • Remote (Everywhere)5 years of exp1 day ago",
          },
        ],
      },
    ]);

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    const job = expectSuccess(result).jobs[0];
    expect(job.title).toBe("Senior React Engineer");
    expect(job.companyName).toBe("TestCo");
    expect(job.externalJobId).toBe("123-senior-react-engineer");
    expect(job.applyUrl).toBe("https://wellfound.com/jobs/123-senior-react-engineer");
    expect(job.compensationMin).toBe(120000);
    expect(job.compensationMax).toBe(160000);
    expect(job.compensationCurrency).toBe("USD");
    expect(job.remoteScope).toBe("global");
    expect(job.workplaceType).toBe("remote");
    expect(job.employmentType).toBe("full-time");
    expect(job.experienceMinYears).toBe(5);
    expect(job.extractedTags).toContain("react");
  });

  it("infers country_fenced for US city locations", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "USCo",
        companyHref: "/company/usco",
        description: "US startup",
        size: "1-10 Employees",
        jobs: [
          {
            title: "Frontend Developer",
            href: "/jobs/456-frontend-developer",
            jobText:
              "Frontend DeveloperFull-timeOnsite or remote • San Francisco3 years of exp2 weeks ago",
          },
        ],
      },
    ]);

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs[0].remoteScope).toBe("country_fenced");
    expect(expectSuccess(result).jobs[0].workplaceType).toBe("hybrid");
  });

  it("harvests employers for the Slugger", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "HarvestCo",
        companyHref: "/company/harvestco",
        description: "Test harvest",
        size: "11-50 Employees",
        jobs: [
          {
            title: "Engineer",
            href: "/jobs/789-engineer",
            jobText: "EngineerFull-timeRemote only • Remote (Worldwide)1 week ago",
          },
        ],
      },
    ]);

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).employers).toBeDefined();
    expect(expectSuccess(result).employers).toHaveLength(1);
    expect(expectSuccess(result).employers![0].companyName).toBe("HarvestCo");
    expect(expectSuccess(result).employers![0].companyHref).toBe("/company/harvestco");
  });

  it("applies tech filter to reject non-matching jobs", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "FilterCo",
        companyHref: "/company/filterco",
        description: "Test filter",
        size: "1-10 Employees",
        jobs: [
          {
            title: "Python Data Engineer",
            href: "/jobs/111-python-data-engineer",
            jobText: "Python Data EngineerFull-timeRemote only • Remote (Everywhere)1 day ago",
          },
          {
            title: "React Frontend Engineer",
            href: "/jobs/222-react-frontend-engineer",
            jobText: "React Frontend EngineerFull-timeRemote only • Remote (Everywhere)1 day ago",
          },
        ],
      },
    ]);

    // Tech filter that only accepts React jobs
    const reactOnlyFilter = (j: { tags: string[]; title: string; description: string }) =>
      j.tags.includes("react") || /react/i.test(j.title);

    const result = await fetchWellfoundJobs(100, reactOnlyFilter, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    expect(expectSuccess(result).jobs[0].title).toBe("React Frontend Engineer");
  });

  it("handles multiple pages and stops at maxPages", async () => {
    const page = await mockPage;
    // Page 1: 1 job
    page.evaluate.mockResolvedValueOnce([
      {
        company: "Page1Co",
        companyHref: "/company/page1co",
        description: "Page 1",
        size: "1-10 Employees",
        jobs: [
          {
            title: "React Engineer",
            href: "/jobs/p1-react-engineer",
            jobText: "React EngineerFull-timeRemote only • Remote (Everywhere)1 day ago",
          },
        ],
      },
    ]);
    // Page 2: 1 job
    page.evaluate.mockResolvedValueOnce([
      {
        company: "Page2Co",
        companyHref: "/company/page2co",
        description: "Page 2",
        size: "11-50 Employees",
        jobs: [
          {
            title: "Vue Engineer",
            href: "/jobs/p2-vue-engineer",
            jobText: "Vue EngineerFull-timeRemote only • Remote (Everywhere)2 days ago",
          },
        ],
      },
    ]);

    const result = await fetchWellfoundJobs(100, () => true, 2);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(2);
    expect(expectSuccess(result).jobs[0].title).toBe("React Engineer");
    expect(expectSuccess(result).jobs[1].title).toBe("Vue Engineer");
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("stops paginating when a page returns no cards", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "OnlyCo",
        companyHref: "/company/onlyco",
        description: "Only page",
        size: "1-10 Employees",
        jobs: [
          {
            title: "Engineer",
            href: "/jobs/only-engineer",
            jobText: "EngineerFull-timeRemote only • Remote (Everywhere)1 day ago",
          },
        ],
      },
    ]);
    // Page 2: empty
    page.evaluate.mockResolvedValueOnce([]);

    const result = await fetchWellfoundJobs(100, () => true, 5);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    // Should only have called goto twice (page 1 + page 2 which was empty)
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("respects maxJobs limit", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "BigCo",
        companyHref: "/company/bigco",
        description: "Big company",
        size: "51-200 Employees",
        jobs: Array.from({ length: 10 }, (_, i) => ({
          title: `Engineer ${i}`,
          href: `/jobs/big-${i}`,
          jobText: `Engineer ${i}Full-timeRemote only • Remote (Everywhere)1 day ago`,
        })),
      },
    ]);

    const result = await fetchWellfoundJobs(3, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(3);
  });

  it("returns error when browser launch fails", async () => {
    const { chromium } = await import("playwright");
    (chromium.launch as any).mockRejectedValueOnce(new Error("Browser not installed"));

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(false);
    expect(expectFailure(result).error).toContain("Browser not installed");
  });

  it("parses salary ranges correctly", async () => {
    const page = await mockPage;
    page.evaluate.mockResolvedValueOnce([
      {
        company: "SalaryCo",
        companyHref: "/company/salaryco",
        description: "Salary test",
        size: "1-10 Employees",
        jobs: [
          {
            title: "Engineer",
            href: "/jobs/salary-test",
            jobText: "EngineerFull-time$80k – $150k • No equityRemote only • United States2 years of exp1 week ago",
          },
        ],
      },
    ]);

    const result = await fetchWellfoundJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs[0].compensationMin).toBe(80000);
    expect(expectSuccess(result).jobs[0].compensationMax).toBe(150000);
    expect(expectSuccess(result).jobs[0].remoteScope).toBe("country_fenced");
  });
});
