/**
 * Unit tests for D4 — Remote OK + Remotive + Himalayas Seeder (TDD §2.4)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

// Mock the slugger module
vi.mock("@/lib/jobs/seeders/slugger", () => ({ resolveSlugger: vi.fn() }));

// D27: Mock the pg-boss scheduler (replaced inngest.send)
vi.mock("@/scheduler/scheduler", () => ({
  scheduler: { send: vi.fn().mockResolvedValue({}) },
}));

import {
  extractCompanyNamesFromHimalayas,
  extractCompanyNamesFromRemoteOk,
  extractCompanyNamesFromRemotive,
  REMOTE_JOB_BOARDS,
  runRemoteJobBoardsSeeder,
} from "@/lib/jobs/seeders/daily-sources/remote-job-boards";
import { deduplicateCompanyNames } from "@/lib/jobs/seeders/seeder-utils";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";
import { scheduler } from "@/scheduler/scheduler";

// ── REMOTE_JOB_BOARDS constant ───────────────────────────────────────────────

describe("REMOTE_JOB_BOARDS", () => {
  it("contains exactly three boards", () => {
    expect(REMOTE_JOB_BOARDS).toHaveLength(3);
  });

  it("includes Remote OK, Remotive, and Himalayas", () => {
    const names = REMOTE_JOB_BOARDS.map((b) => b.name);
    expect(names).toContain("remoteok");
    expect(names).toContain("remotive");
    expect(names).toContain("himalayas");
  });

  it("each board has a name and url", () => {
    for (const board of REMOTE_JOB_BOARDS) {
      expect(board.name).toBeTruthy();
      expect(board.url).toBeTruthy();
      expect(board.url).toMatch(/^https?:\/\//);
    }
  });
});

// ── extractCompanyNamesFromRemoteOk ──────────────────────────────────────────

describe("extractCompanyNamesFromRemoteOk", () => {
  it("extracts company names from valid Remote OK data (skipping index 0)", () => {
    const data = [
      { count: 100, legal: "..." }, // metadata object at index 0
      { id: 1, company: "Stripe", position: "Engineer" },
      { id: 2, company: "Klarna", position: "Designer" },
      { id: 3, company: "Acme Corp", position: "PM" },
    ];

    const names = extractCompanyNamesFromRemoteOk(data);
    expect(names).toHaveLength(3);
    expect(names).toEqual(["Stripe", "Klarna", "Acme Corp"]);
  });

  it("returns empty array for empty data", () => {
    expect(extractCompanyNamesFromRemoteOk([])).toEqual([]);
  });

  it("returns empty array for non-array data", () => {
    expect(extractCompanyNamesFromRemoteOk(null)).toEqual([]);
    expect(extractCompanyNamesFromRemoteOk({})).toEqual([]);
    expect(extractCompanyNamesFromRemoteOk("not an array")).toEqual([]);
  });

  it("skips jobs missing the company field", () => {
    const data = [
      { count: 100 }, // metadata
      { id: 1, company: "Stripe" },
      { id: 2, position: "No company field" },
      { id: 3, company: "Klarna" },
    ];

    const names = extractCompanyNamesFromRemoteOk(data);
    expect(names).toEqual(["Stripe", "Klarna"]);
  });

  it("skips jobs where company is not a string", () => {
    const data = [
      { count: 100 }, // metadata
      { id: 1, company: "Stripe" },
      { id: 2, company: 123 },
      { id: 3, company: null },
    ];

    const names = extractCompanyNamesFromRemoteOk(data);
    expect(names).toEqual(["Stripe"]);
  });

  it("handles data with only the metadata object", () => {
    const data = [{ count: 100, legal: "..." }];
    expect(extractCompanyNamesFromRemoteOk(data)).toEqual([]);
  });
});

// ── extractCompanyNamesFromRemotive ──────────────────────────────────────────

describe("extractCompanyNamesFromRemotive", () => {
  it("extracts company_name from valid Remotive data", () => {
    const data = {
      jobs: [
        { id: 1, company_name: "Stripe", title: "Engineer" },
        { id: 2, company_name: "Klarna", title: "Designer" },
      ],
      "0": "metadata",
    };

    const names = extractCompanyNamesFromRemotive(data);
    expect(names).toHaveLength(2);
    expect(names).toEqual(["Stripe", "Klarna"]);
  });

  it("returns empty array for empty jobs array", () => {
    const data = { jobs: [] };
    expect(extractCompanyNamesFromRemotive(data)).toEqual([]);
  });

  it("returns empty array when jobs is missing", () => {
    expect(extractCompanyNamesFromRemotive({})).toEqual([]);
  });

  it("returns empty array for non-object data", () => {
    expect(extractCompanyNamesFromRemotive(null)).toEqual([]);
    expect(extractCompanyNamesFromRemotive("not an object")).toEqual([]);
    expect(extractCompanyNamesFromRemotive([])).toEqual([]);
  });

  it("skips jobs missing the company_name field", () => {
    const data = {
      jobs: [
        { id: 1, company_name: "Stripe" },
        { id: 2, title: "No company" },
        { id: 3, company_name: "Klarna" },
      ],
    };

    const names = extractCompanyNamesFromRemotive(data);
    expect(names).toEqual(["Stripe", "Klarna"]);
  });

  it("skips jobs where company_name is not a string", () => {
    const data = {
      jobs: [
        { id: 1, company_name: "Stripe" },
        { id: 2, company_name: 42 },
        { id: 3, company_name: null },
      ],
    };

    const names = extractCompanyNamesFromRemotive(data);
    expect(names).toEqual(["Stripe"]);
  });
});

// ── extractCompanyNamesFromHimalayas ─────────────────────────────────────────

describe("extractCompanyNamesFromHimalayas", () => {
  it("extracts company names from valid Himalayas data", () => {
    const data = [
      { id: 1, company: "Stripe", title: "Engineer" },
      { id: 2, company: "Klarna", title: "Designer" },
      { id: 3, company: "Acme Corp", title: "PM" },
    ];

    const names = extractCompanyNamesFromHimalayas(data);
    expect(names).toHaveLength(3);
    expect(names).toEqual(["Stripe", "Klarna", "Acme Corp"]);
  });

  it("returns empty array for empty data", () => {
    expect(extractCompanyNamesFromHimalayas([])).toEqual([]);
  });

  it("returns empty array for non-array data", () => {
    expect(extractCompanyNamesFromHimalayas(null)).toEqual([]);
    expect(extractCompanyNamesFromHimalayas({})).toEqual([]);
    expect(extractCompanyNamesFromHimalayas("not an array")).toEqual([]);
  });

  it("skips jobs missing the company field", () => {
    const data = [
      { id: 1, company: "Stripe" },
      { id: 2, title: "No company" },
      { id: 3, company: "Klarna" },
    ];

    const names = extractCompanyNamesFromHimalayas(data);
    expect(names).toEqual(["Stripe", "Klarna"]);
  });

  it("skips jobs where company is not a string", () => {
    const data = [
      { id: 1, company: "Stripe" },
      { id: 2, company: 999 },
      { id: 3, company: undefined },
    ];

    const names = extractCompanyNamesFromHimalayas(data);
    expect(names).toEqual(["Stripe"]);
  });
});

// ── deduplicateCompanyNames ──────────────────────────────────────────────────

describe("deduplicateCompanyNames", () => {
  it("removes exact duplicates", () => {
    const names = ["Stripe", "Klarna", "Stripe", "Acme", "Klarna"];
    expect(deduplicateCompanyNames(names)).toEqual([
      "Stripe",
      "Klarna",
      "Acme",
    ]);
  });

  it("deduplicates case-insensitively, preserving first-seen casing", () => {
    const names = ["Stripe", "stripe", "STRIPE", "Klarna", "KLARNA"];
    expect(deduplicateCompanyNames(names)).toEqual(["Stripe", "Klarna"]);
  });

  it("filters out empty strings", () => {
    const names = ["Stripe", "", "Klarna", ""];
    expect(deduplicateCompanyNames(names)).toEqual(["Stripe", "Klarna"]);
  });

  it("filters out whitespace-only strings", () => {
    const names = ["Stripe", "   ", "Klarna", "\t", ""];
    expect(deduplicateCompanyNames(names)).toEqual(["Stripe", "Klarna"]);
  });

  it("trims surrounding whitespace from names", () => {
    const names = ["  Stripe  ", "Klarna"];
    expect(deduplicateCompanyNames(names)).toEqual(["Stripe", "Klarna"]);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateCompanyNames([])).toEqual([]);
  });

  it("returns empty array when all names are empty", () => {
    expect(deduplicateCompanyNames(["", "  ", "\t"])).toEqual([]);
  });
});

// ── runRemoteJobBoardsSeeder ─────────────────────────────────────────────────

describe("runRemoteJobBoardsSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scheduler.send).mockResolvedValue({} as never);
  });

  function makeSuccessResult(companyName: string): SluggerResult {
    return {
      success: true,
      atsSource: "greenhouse",
      atsSlug: companyName.toLowerCase(),
      resolvedBy: "slug_probe",
      canonicalName: companyName.toLowerCase(),
    };
  }

  function mockFetch(
    responses: Record<string, unknown>,
    fetchFnImpl?: FetchFn,
  ): FetchFn {
    if (fetchFnImpl) return fetchFnImpl;
    return vi.fn(async (url: string) => {
      for (const [boardUrl, data] of Object.entries(responses)) {
        if (url === boardUrl) {
          return new Response(JSON.stringify(data), { status: 200 });
        }
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;
  }

  it("fetches from all three boards, resolves companies, fires events", async () => {
    const remoteOkData = [
      { count: 100 }, // metadata at index 0
      { id: 1, company: "Stripe" },
      { id: 2, company: "Klarna" },
    ];
    const remotiveData = {
      jobs: [
        { id: 1, company_name: "Acme Corp" },
        { id: 2, company_name: "Stripe" }, // duplicate across boards
      ],
    };
    const himalayasData = [{ id: 1, company: "Docker" }];

    const fetchFn = mockFetch({
      "https://remoteok.com/api": remoteOkData,
      "https://remotive.com/api/remotejobs": remotiveData,
      "https://himalayas.app/jobs/api": himalayasData,
    });

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(makeSuccessResult("Stripe"))
      .mockResolvedValueOnce(makeSuccessResult("Klarna"))
      .mockResolvedValueOnce(makeSuccessResult("Acme Corp"))
      .mockResolvedValueOnce(makeSuccessResult("Docker"));

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    // totalJobs: Remote OK has 2 jobs (3 elements - 1 metadata),
    //             Remotive has 2 jobs, Himalayas has 1 job → 5
    expect(result.totalJobs).toBe(5);
    // uniqueCompanies: Stripe, Klarna, Acme Corp, Docker → 4
    expect(result.uniqueCompanies).toBe(4);
    expect(result.resolved).toBe(4);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();

    // resolveSlugger called once per unique company
    expect(resolveSlugger).toHaveBeenCalledTimes(4);

    // scheduler.send called once per resolved company
    expect(scheduler.send).toHaveBeenCalledTimes(4);
  });

  it("handles individual board failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url === "https://remoteok.com/api") {
        return new Response("Server Error", { status: 500 });
      }
      if (url === "https://remotive.com/api/remotejobs") {
        return new Response(
          JSON.stringify({
            jobs: [{ id: 1, company_name: "Stripe" }],
          }),
          { status: 200 },
        );
      }
      if (url === "https://himalayas.app/jobs/api") {
        return new Response(JSON.stringify([{ id: 1, company: "Klarna" }]), {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(makeSuccessResult("Stripe"))
      .mockResolvedValueOnce(makeSuccessResult("Klarna"));

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    // Remote OK failed (0 jobs), Remotive 1 job, Himalayas 1 job → 2
    expect(result.totalJobs).toBe(2);
    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("handles network error for a single board gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url === "https://remoteok.com/api") {
        throw new Error("Network error");
      }
      if (url === "https://remotive.com/api/remotejobs") {
        return new Response(
          JSON.stringify({
            jobs: [{ id: 1, company_name: "Stripe" }],
          }),
          { status: 200 },
        );
      }
      if (url === "https://himalayas.app/jobs/api") {
        return new Response(JSON.stringify([{ id: 1, company: "Klarna" }]), {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(makeSuccessResult("Stripe"))
      .mockResolvedValueOnce(makeSuccessResult("Klarna"));

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    expect(result.totalJobs).toBe(2);
    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("handles empty results from all boards", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [{ count: 0 }], // only metadata
      "https://remotive.com/api/remotejobs": { jobs: [] },
      "https://himalayas.app/jobs/api": [],
    });

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    expect(result.totalJobs).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
    expect(scheduler.send).not.toHaveBeenCalled();
  });

  it("counts unresolved companies when Slugger fails", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [
        { count: 0 },
        { id: 1, company: "Stripe" },
        { id: 2, company: "Klarna" },
      ],
      "https://remotive.com/api/remotejobs": { jobs: [] },
      "https://himalayas.app/jobs/api": [],
    });

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(makeSuccessResult("Stripe"))
      .mockResolvedValueOnce({ success: false, canonicalName: "klarna" });

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);

    // scheduler.send only fired for the resolved company
    expect(scheduler.send).toHaveBeenCalledTimes(1);
  });

  it("passes correct SluggerInput with discoverySource=hn_algolia", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [{ count: 0 }, { id: 1, company: "Stripe" }],
      "https://remotive.com/api/remotejobs": { jobs: [] },
      "https://himalayas.app/jobs/api": [],
    });

    vi.mocked(resolveSlugger).mockResolvedValueOnce(
      makeSuccessResult("Stripe"),
    );

    await runRemoteJobBoardsSeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const [input, opts] = vi.mocked(resolveSlugger).mock.calls[0];
    expect(input.companyName).toBe("Stripe");
    expect(input.discoverySource).toBe("hn_algolia");
    expect(input.discoveryContext).toContain("remote-board:");
    expect(input.discoveryContext).toContain("company:Stripe");
    expect(opts?.insertCompany).toBe(true);
  });

  it("uses discoveryContext format remote-board:{boardName} company:{companyName}", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [{ count: 0 }, { id: 1, company: "Stripe" }],
      "https://remotive.com/api/remotejobs": { jobs: [] },
      "https://himalayas.app/jobs/api": [],
    });

    vi.mocked(resolveSlugger).mockResolvedValueOnce(
      makeSuccessResult("Stripe"),
    );

    await runRemoteJobBoardsSeeder(fetchFn);

    const input = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(input.discoveryContext).toBe("remote-board:remoteok company:Stripe");
  });

  it("fires job/aggregator-ingested events with correct source", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [{ count: 0 }, { id: 1, company: "Stripe" }],
      "https://remotive.com/api/remotejobs": {
        jobs: [{ id: 1, company_name: "Klarna" }],
      },
      "https://himalayas.app/jobs/api": [],
    });

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(makeSuccessResult("Stripe"))
      .mockResolvedValueOnce(makeSuccessResult("Klarna"));

    await runRemoteJobBoardsSeeder(fetchFn);

    expect(scheduler.send).toHaveBeenCalledTimes(2);

    const calls = vi.mocked(scheduler.send).mock.calls;
    // scheduler.send(name, data, id?) — first arg is event name
    const eventNames = calls.map((c) => c[0]);
    expect(eventNames.every((n) => n === "job/aggregator-ingested")).toBe(true);

    // Verify the event data includes company and source
    const firstEventData = calls[0][1] as Record<string, unknown>;
    expect(firstEventData.company).toBeTruthy();
    expect(firstEventData.source).toBeTruthy();
    expect(firstEventData.externalJobId).toBeTruthy();
  });

  it("handles Slugger throwing an error for a single company", async () => {
    const fetchFn = mockFetch({
      "https://remoteok.com/api": [
        { count: 0 },
        { id: 1, company: "Stripe" },
        { id: 2, company: "Klarna" },
      ],
      "https://remotive.com/api/remotejobs": { jobs: [] },
      "https://himalayas.app/jobs/api": [],
    });

    vi.mocked(resolveSlugger)
      .mockRejectedValueOnce(new Error("Slugger crashed"))
      .mockResolvedValueOnce(makeSuccessResult("Klarna"));

    const result = await runRemoteJobBoardsSeeder(fetchFn);

    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });
});
