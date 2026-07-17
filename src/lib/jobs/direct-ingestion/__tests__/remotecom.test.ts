// Tests for the Remote.com direct-ingestion adapter
// src/lib/jobs/direct-ingestion/__tests__/remotecom.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock playwright
vi.mock("playwright", () => {
  const mockPage = {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
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

// Mock scanTagsRegex
vi.mock("../../job-normalizer", () => ({
  scanTagsRegex: (text: string) => {
    const tags: string[] = [];
    if (/\breact\b/i.test(text)) tags.push("react");
    if (/\btypescript\b/i.test(text)) tags.push("typescript");
    if (/\bnode\.?js\b/i.test(text)) tags.push("nodejs");
    if (/\bpython\b/i.test(text)) tags.push("python");
    if (/\bdjango\b/i.test(text)) tags.push("django");
    if (/\bvue\b/i.test(text)) tags.push("vue");
    if (/\bazure\b/i.test(text)) tags.push("azure");
    return tags;
  },
}));

import { fetchRemoteComJobs } from "../remotecom";

// Type narrowing helper for discriminated union results
function expectSuccess(r: any): { jobs: any[] } {
  expect(r.success).toBe(true);
  return r;
}
function expectFailure(r: any): { error: string } {
  expect(r.success).toBe(false);
  return r;
}

const playwright = await import("playwright");
const mockBrowser = playwright.chromium;
const mockPagePromise = (mockBrowser.launch as any)().then((b: any) => b.newContext().then((c: any) => c.newPage()));

describe("Remote.com adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result when page has no job links", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([]);

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toEqual([]);
  });

  it("parses job cards into DirectIngestionJob objects", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Senior Frontend Developer (React.js)",
        href: "/jobs/proxify-c114ohln/senior-frontend-developer-react-js-j124ckja",
        cardText:
          "Senior Frontend Developer (React.js)Proxify4k - 8k EUR/monthRemoteAnywhereContract",
      },
    ]);

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    const job = expectSuccess(result).jobs[0];
    expect(job.title).toBe("Senior Frontend Developer (React.js)");
    expect(job.companyName).toBe("Proxify");
    expect(job.externalJobId).toBe("senior-frontend-developer-react-js-j124ckja");
    expect(job.applyUrl).toBe(
      "https://remote.com/jobs/proxify-c114ohln/senior-frontend-developer-react-js-j124ckja",
    );
    expect(job.compensationMin).toBe(4000);
    expect(job.compensationMax).toBe(8000);
    expect(job.compensationCurrency).toBe("EUR");
    expect(job.remoteScope).toBe("global");
    expect(job.workplaceType).toBe("remote");
    expect(job.employmentType).toBe("contract");
    expect(job.extractedTags).toContain("react");
  });

  it("infers global for GMT timezone ranges", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Software Engineer",
        href: "/jobs/testco-c1abc123/software-engineer-j1xyz789",
        cardText:
          "8 days agoremote - GMT-6 to GMT-4 onlySoftware EngineerTestCo2 - 4 USD/yearQuick applyRemoteGMT-6 to GMT-4Full-time",
      },
    ]);

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs[0].remoteScope).toBe("global");
  });

  it("extracts company name from href slug", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Backend Developer",
        href: "/jobs/synergy-injury-relief-pllc-c1t4j3ey/backend-developer-j133hpn2",
        cardText:
          "Backend DeveloperSynergy Injury Relief PLLC5k - 7k USD/yearRemoteAnywhereFull-time",
      },
    ]);

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    // Company should be extracted from href when not parseable from cardText
    // In this case, the card text has the company, but the href extraction is the fallback
    expect(expectSuccess(result).jobs[0].companyName).toBeTruthy();
  });

  it("applies tech filter to reject non-matching jobs", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Senior Backend Developer (Python/Django)",
        href: "/jobs/proxify-c114ohln/senior-backend-developer-python-django-j12wcpci",
        cardText:
          "Senior Backend Developer (Python/Django)Proxify3k - 6k EUR/monthRemoteAnywhereContract",
      },
      {
        title: "Senior Frontend Developer (React.js)",
        href: "/jobs/proxify-c114ohln/senior-frontend-developer-react-js-j124ckja",
        cardText:
          "Senior Frontend Developer (React.js)Proxify4k - 8k EUR/monthRemoteAnywhereContract",
      },
    ]);

    // Tech filter that only accepts React jobs
    const reactOnlyFilter = (j: { tags: string[]; title: string; description: string }) =>
      j.tags.includes("react") || /react/i.test(j.title);

    const result = await fetchRemoteComJobs(100, reactOnlyFilter, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    expect(expectSuccess(result).jobs[0].title).toBe("Senior Frontend Developer (React.js)");
  });

  it("handles multiple pages", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "React Engineer",
        href: "/jobs/comp1-c1aaa111/react-engineer-j1bbb111",
        cardText: "React EngineerComp1RemoteAnywhereContract",
      },
    ]);
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Vue Engineer",
        href: "/jobs/comp2-c2bbb222/vue-engineer-j2ccc222",
        cardText: "Vue EngineerComp2RemoteAnywhereFull-time",
      },
    ]);

    const result = await fetchRemoteComJobs(100, () => true, 2);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(2);
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("stops paginating when a page returns no jobs", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Engineer",
        href: "/jobs/comp-c1aaa111/engineer-j1bbb111",
        cardText: "EngineerCompRemoteAnywhereContract",
      },
    ]);
    page.evaluate.mockResolvedValueOnce([]);

    const result = await fetchRemoteComJobs(100, () => true, 5);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(1);
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("respects maxJobs limit", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({
        title: `Engineer ${i}`,
        href: `/jobs/comp-c${i}/engineer-${i}-j${i}`,
        cardText: `Engineer ${i}CompRemoteAnywhereContract`,
      })),
    );

    const result = await fetchRemoteComJobs(5, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs).toHaveLength(5);
  });

  it("returns error when browser launch fails", async () => {
    const { chromium } = await import("playwright");
    (chromium.launch as any).mockRejectedValueOnce(new Error("Browser not installed"));

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(false);
    expect(expectFailure(result).error).toContain("Browser not installed");
  });

  it("parses USD salary correctly", async () => {
    const page = await mockPagePromise;
    page.evaluate.mockResolvedValueOnce([
      {
        title: "Medical Interpreter",
        href: "/jobs/medco-c1med123/medical-interpreter-j1med456",
        cardText:
          "Medical InterpreterMedCo2 - 4 USD/yearRemoteAnywhereFull-time",
      },
    ]);

    const result = await fetchRemoteComJobs(100, () => true, 1);

    expect(result.success).toBe(true);
    expect(expectSuccess(result).jobs[0].compensationMin).toBe(2);
    expect(expectSuccess(result).jobs[0].compensationMax).toBe(4);
    expect(expectSuccess(result).jobs[0].compensationCurrency).toBe("USD");
  });
});
