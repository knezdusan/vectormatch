/**
 * Unit tests for the Phalanx Poller orchestrator (TDD §4.4).
 *
 * Tests the `pollCompany` function with mocked fetch, DB upserts, and company
 * state updates. No real network or database calls are made.
 */

import { vi } from "vitest";

// Mock all DB-dependent modules
vi.mock("@/lib/jobs/poller/rate-limiter", () => ({
  getLimiter: () => ({
    schedule: (fn: () => Promise<unknown>) => fn(),
  }),
}));

vi.mock("@/lib/jobs/poller/job-repository", () => ({
  upsertJobs: vi.fn(),
  countActiveJobs: vi.fn().mockResolvedValue(0),
  markStaleJobs: vi.fn(),
  markUnseenJobsStale: vi.fn(),
}));

vi.mock("@/lib/jobs/poller/company-state", () => ({
  updateCompanyState: vi.fn(),
  healthFromHttpError: vi.fn().mockReturnValue("error"),
  healthFromValidationError: vi.fn().mockReturnValue("degraded"),
  healthFromNetworkError: vi.fn().mockReturnValue("error"),
}));

vi.mock("@/lib/jobs/poller/ingestion-log", () => ({
  writeIngestionLog: vi.fn().mockResolvedValue(undefined),
}));

import { updateCompanyState } from "@/lib/jobs/poller/company-state";
import { countActiveJobs, upsertJobs } from "@/lib/jobs/poller/job-repository";
import { pollCompany } from "@/lib/jobs/poller/phalanx-poller";
import type { FetchFn } from "@/lib/jobs/types";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(response: Response): FetchFn {
  const fn = vi.fn(async () => response);
  return fn as unknown as FetchFn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const greenhouseResponse = {
  jobs: [
    {
      id: 12345,
      title: "Senior Frontend Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
    },
    {
      id: 12346,
      title: "Account Executive", // Should be rejected by Gate 0
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12346",
    },
    {
      id: 12347,
      title: "Backend Developer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12347",
    },
  ],
};

// ── pollCompany — successful poll ────────────────────────────────────────────

describe("pollCompany — successful poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upsertJobs).mockResolvedValue({
      totalUpserted: 2,
      newJobIds: ["job-1", "job-2"],
      updatedCount: 0,
    });
    vi.mocked(countActiveJobs).mockResolvedValue(2);
  });

  it("fetches jobs, applies Gate 0, and upserts filtered jobs", async () => {
    const result = await pollCompany(
      "company-uuid-1",
      "greenhouse",
      "acme",
      mockFetch(jsonResponse(greenhouseResponse)),
    );

    expect(result.jobsFetched).toBe(3);
    expect(result.jobsPassedGate0).toBe(2); // Engineer + Developer pass
    expect(result.jobsRejectedByGate0).toBe(1); // Account Executive rejected
    expect(result.jobsUpserted).toBe(2);
    expect(result.newJobIds).toEqual(["job-1", "job-2"]);
    expect(result.health).toBe("healthy");
  });

  it("calls upsertJobs with only Gate 0-passing jobs", async () => {
    await pollCompany(
      "company-uuid-1",
      "greenhouse",
      "acme",
      mockFetch(jsonResponse(greenhouseResponse)),
    );

    expect(upsertJobs).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(upsertJobs).mock.calls[0];
    expect(callArg[0]).toBe("greenhouse");
    expect(callArg[1]).toBe("acme");
    expect(callArg[2]).toHaveLength(2); // Only 2 jobs passed Gate 0
    expect(callArg[2][0].title).toBe("Senior Frontend Engineer");
    expect(callArg[2][1].title).toBe("Backend Developer");
  });

  it("updates company state on success", async () => {
    await pollCompany(
      "company-uuid-1",
      "greenhouse",
      "acme",
      mockFetch(jsonResponse(greenhouseResponse)),
    );

    expect(updateCompanyState).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(updateCompanyState).mock.calls[0];
    expect(callArg[0]).toBe("company-uuid-1");
    expect(callArg[1].success).toBe(true);
    expect(callArg[1].health).toBe("healthy");
  });

  it("skips jobs older than MAX_JOB_INJECTION_AGE_DAYS and reports them as jobsTooOld", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const response = {
      jobs: [
        {
          id: 1,
          title: "Senior Frontend Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
          first_published: oldDate.toISOString(),
        },
        {
          id: 2,
          title: "Backend Developer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/2",
          first_published: new Date().toISOString(),
        },
      ],
    };

    const result = await pollCompany(
      "company-uuid-1",
      "greenhouse",
      "acme",
      mockFetch(jsonResponse(response)),
    );

    expect(result.jobsFetched).toBe(2);
    expect(result.jobsPassedGate0).toBe(2);
    expect(result.jobsTooOld).toBe(1);

    expect(upsertJobs).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(upsertJobs).mock.calls[0];
    expect(callArg[2]).toHaveLength(1);
    expect(callArg[2][0].title).toBe("Backend Developer");
  });

  it("skips jobs explicitly marked inactive by the source and reports them as jobsInactive", async () => {
    const response = {
      content: [
        {
          id: "sr-1",
          name: "Senior Frontend Engineer",
          status: "CLOSED",
        },
        {
          id: "sr-2",
          name: "Backend Developer",
          status: "POSTED",
        },
      ],
    };

    const result = await pollCompany(
      "company-uuid-1",
      "smartrecruiters",
      "acme",
      mockFetch(jsonResponse(response)),
    );

    expect(result.jobsFetched).toBe(2);
    expect(result.jobsPassedGate0).toBe(2);
    expect(result.jobsInactive).toBe(1);
    expect(result.jobsTooOld).toBe(0);

    expect(upsertJobs).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(upsertJobs).mock.calls[0];
    expect(callArg[2]).toHaveLength(1);
    expect(callArg[2][0].title).toBe("Backend Developer");
  });
});

// ── pollCompany — Gate 0 rejects all jobs ────────────────────────────────────

describe("pollCompany — all jobs rejected by Gate 0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upsertJobs).mockResolvedValue({
      totalUpserted: 0,
      newJobIds: [],
      updatedCount: 0,
    });
    vi.mocked(countActiveJobs).mockResolvedValue(0);
  });

  it("handles a company with only non-engineering jobs", async () => {
    const response = {
      jobs: [
        { id: 1, title: "HR Manager", absolute_url: "https://example.com/1" },
        { id: 2, title: "Sales Rep", absolute_url: "https://example.com/2" },
      ],
    };

    const result = await pollCompany(
      "company-uuid-2",
      "greenhouse",
      "noneng",
      mockFetch(jsonResponse(response)),
    );

    expect(result.jobsFetched).toBe(2);
    expect(result.jobsPassedGate0).toBe(0);
    expect(result.jobsRejectedByGate0).toBe(2);
    expect(result.jobsUpserted).toBe(0);
    expect(result.newJobIds).toHaveLength(0);
  });
});

// ── pollCompany — HTTP errors ────────────────────────────────────────────────

describe("pollCompany — HTTP errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles 404 (endpoint gone) and updates company state", async () => {
    const result = await pollCompany(
      "company-uuid-3",
      "greenhouse",
      "gonecompany",
      mockFetch(new Response("Not Found", { status: 404 })),
    );

    expect(result.jobsFetched).toBe(0);
    expect(result.error).toContain("404");
    expect(updateCompanyState).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(updateCompanyState).mock.calls[0];
    expect(callArg[1].success).toBe(false);
  });

  it("handles 429 (rate limited) and updates company state", async () => {
    const result = await pollCompany(
      "company-uuid-4",
      "lever",
      "ratelimited",
      mockFetch(new Response("Too Many Requests", { status: 429 })),
    );

    expect(result.error).toContain("429");
    expect(updateCompanyState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateCompanyState).mock.calls[0][1].success).toBe(false);
  });
});

// ── pollCompany — Zod validation failure ─────────────────────────────────────

describe("pollCompany — Zod validation failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles malformed ATS response and marks company as degraded", async () => {
    const result = await pollCompany(
      "company-uuid-5",
      "greenhouse",
      "brokenslug",
      mockFetch(jsonResponse({ wrong: "shape" })),
    );

    expect(result.jobsFetched).toBe(0);
    expect(result.error).toContain("validation");
    expect(updateCompanyState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateCompanyState).mock.calls[0][1].success).toBe(false);
  });
});

// ── pollCompany — network errors ─────────────────────────────────────────────

describe("pollCompany — network errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles network failure and updates company state", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await pollCompany(
      "company-uuid-6",
      "greenhouse",
      "acme",
      fetchFn,
    );

    expect(result.jobsFetched).toBe(0);
    expect(result.error).toContain("ECONNREFUSED");
    expect(updateCompanyState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateCompanyState).mock.calls[0][1].success).toBe(false);
  });
});

// ── pollCompany — empty jobs list ────────────────────────────────────────────

describe("pollCompany — empty jobs list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upsertJobs).mockResolvedValue({
      totalUpserted: 0,
      newJobIds: [],
      updatedCount: 0,
    });
    vi.mocked(countActiveJobs).mockResolvedValue(0);
  });

  it("handles a company with no open jobs", async () => {
    const result = await pollCompany(
      "company-uuid-7",
      "greenhouse",
      "nojobs",
      mockFetch(jsonResponse({ jobs: [] })),
    );

    expect(result.jobsFetched).toBe(0);
    expect(result.jobsPassedGate0).toBe(0);
    expect(result.jobsUpserted).toBe(0);
    expect(result.newJobIds).toHaveLength(0);
    expect(result.health).toBe("healthy"); // No jobs = healthy, just no openings
  });
});
