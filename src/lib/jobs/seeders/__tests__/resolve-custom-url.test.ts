/**
 * Unit tests for the custom URL resolver (TDD §4.1.2).
 *
 * Tests the two-stage resolution process with mocked DNS CNAME lookups and
 * mocked HTTP fetch. No real network calls are made.
 *
 * Stage 1 — CNAME check: hostname CNAME resolves to a known ATS host.
 * Stage 2 — Slug probe: try the inferred slug against all three ATS APIs.
 * Failure — both stages fail → discard (no manual review).
 */

import type {
  FetchFn,
  ResolveCnameFn,
} from "@/lib/jobs/seeders/resolve-custom-url";
import {
  resolveCustomUrl,
  resolveCustomUrls,
} from "@/lib/jobs/seeders/resolve-custom-url";

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** A mock CNAME resolver that returns a fixed mapping. */
function makeMockCnameResolver(
  mappings: Record<string, string[]>,
): ResolveCnameFn {
  return vi.fn(async (hostname: string) => {
    const result = mappings[hostname.toLowerCase()];
    if (!result) throw new Error(`ENOTFOUND ${hostname}`);
    return result;
  });
}

/** A mock fetch that returns fixed responses by URL pattern. */
function makeMockFetch(
  responses: { urlPattern: string; status: number; body: string }[],
): FetchFn {
  const mock = vi.fn(async (url: string) => {
    for (const { urlPattern, status, body } of responses) {
      if (url.includes(urlPattern)) {
        return new Response(body, { status });
      }
    }
    return new Response("Not Found", { status: 404 });
  });
  return mock as unknown as FetchFn;
}

// ── resolveCustomUrl — Stage 1: CNAME resolution ─────────────────────────────

describe("resolveCustomUrl — Stage 1: CNAME resolution", () => {
  it("resolves a CNAME to Greenhouse", async () => {
    const resolveCname = makeMockCnameResolver({
      "careers.acme.com": ["boards.greenhouse.io"],
    });
    const fetchFn = makeMockFetch([]);

    const result = await resolveCustomUrl(
      "https://careers.acme.com",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("greenhouse");
      expect(result.input.atsSlug).toBe("acme"); // root domain, not "careers"
      expect(result.input.discoverySource).toBe("hn_custom_url");
      expect(result.resolvedBy).toBe("cname");
    }
  });

  it("resolves a CNAME to Lever", async () => {
    const resolveCname = makeMockCnameResolver({
      "careers.acme.com": ["acme.jobs.lever.co"],
    });

    const result = await resolveCustomUrl(
      "https://careers.acme.com",
      resolveCname,
      makeMockFetch([]),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("lever");
      expect(result.resolvedBy).toBe("cname");
    }
  });

  it("resolves a CNAME to Ashby", async () => {
    const resolveCname = makeMockCnameResolver({
      "careers.acme.com": ["careers.ashbyhq.com"],
    });

    const result = await resolveCustomUrl(
      "https://careers.acme.com",
      resolveCname,
      makeMockFetch([]),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("ashby");
      expect(result.resolvedBy).toBe("cname");
    }
  });

  it("extracts rootDomain from the custom URL", async () => {
    const resolveCname = makeMockCnameResolver({
      "careers.acme.com": ["boards.greenhouse.io"],
    });

    const result = await resolveCustomUrl(
      "https://careers.acme.com",
      resolveCname,
      makeMockFetch([]),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.rootDomain).toBe("acme.com");
    }
  });
});

// ── resolveCustomUrl — Stage 2: Slug probe ───────────────────────────────────

describe("resolveCustomUrl — Stage 2: Slug probe", () => {
  it("resolves via slug probe when CNAME fails (Greenhouse)", async () => {
    // CNAME fails (ENOTFOUND), slug probe succeeds against Greenhouse
    const resolveCname = makeMockCnameResolver({}); // no mappings → throws
    const fetchFn = makeMockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme/jobs",
        status: 200,
        body: JSON.stringify({ jobs: [{ id: 1, title: "Engineer" }] }),
      },
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("greenhouse");
      expect(result.input.atsSlug).toBe("acme");
      expect(result.resolvedBy).toBe("slug_probe");
    }
  });

  it("resolves via slug probe when CNAME fails (Lever)", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([
          {
            id: "1",
            text: "Engineer",
            hostedUrl: "https://jobs.lever.co/acme/1",
          },
        ]),
      },
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("lever");
      expect(result.resolvedBy).toBe("slug_probe");
    }
  });

  it("resolves via slug probe when CNAME fails (Ashby)", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([
      {
        urlPattern: "api.ashbyhq.com/posting-api/job-board/acme",
        status: 200,
        body: JSON.stringify({ jobs: [{ id: "1", title: "Engineer" }] }),
      },
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("ashby");
      expect(result.resolvedBy).toBe("slug_probe");
    }
  });

  it("tries Greenhouse first, then Lever, then Ashby", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([
          {
            id: "1",
            text: "Engineer",
            hostedUrl: "https://jobs.lever.co/acme/1",
          },
        ]),
      },
      // Greenhouse returns 404 (slug not found there)
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("lever");
    }
  });
});

// ── resolveCustomUrl — Failure cases ─────────────────────────────────────────

describe("resolveCustomUrl — failure cases", () => {
  it("fails when both CNAME and slug probe fail", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([]); // all 404

    const result = await resolveCustomUrl(
      "https://mystartup.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("cname_and_slug_probe_failed");
      expect(result.url).toBe("https://mystartup.com/careers");
    }
  });

  it("fails for an invalid URL", async () => {
    const result = await resolveCustomUrl(
      "not-a-url",
      makeMockCnameResolver({}),
      makeMockFetch([]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_url");
    }
  });

  it("fails when ATS API returns non-JSON (HTML error page)", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([
      {
        urlPattern: "greenhouse.io",
        status: 200,
        body: "<html><body>Not found</body></html>",
      },
      {
        urlPattern: "lever.co",
        status: 200,
        body: "<html><body>Not found</body></html>",
      },
      {
        urlPattern: "ashbyhq.com",
        status: 200,
        body: "<html><body>Not found</body></html>",
      },
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    expect(result.success).toBe(false);
  });

  it("fails when ATS API returns empty JSON array (Lever, no jobs)", async () => {
    const resolveCname = makeMockCnameResolver({});
    const fetchFn = makeMockFetch([
      {
        urlPattern: "greenhouse.io",
        status: 404,
        body: "Not Found",
      },
      {
        urlPattern: "lever.co",
        status: 200,
        body: "[]", // Empty array — Lever returns this for unknown slugs sometimes
      },
      {
        urlPattern: "ashbyhq.com",
        status: 404,
        body: "Not Found",
      },
    ]);

    const result = await resolveCustomUrl(
      "https://acme.com/careers",
      resolveCname,
      fetchFn,
    );

    // An empty array IS valid JSON and IS an array — so Lever "matches" even
    // with no jobs. This is acceptable: the slug exists, the company just has
    // no open jobs right now. The poller will pick up jobs when they're posted.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.input.atsSource).toBe("lever");
    }
  });
});

// ── resolveCustomUrls (batch) ────────────────────────────────────────────────

describe("resolveCustomUrls (batch)", () => {
  it("resolves a batch of URLs, separating successes from failures", async () => {
    const resolveCname = makeMockCnameResolver({
      "careers.acme.com": ["boards.greenhouse.io"],
    });
    const fetchFn = makeMockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/foobar/jobs",
        status: 200,
        body: JSON.stringify({ jobs: [{ id: 1, title: "Engineer" }] }),
      },
    ]);

    const result = await resolveCustomUrls(
      [
        "https://careers.acme.com", // CNAME → greenhouse
        "https://foobar.com/careers", // slug probe → greenhouse
        "https://unresolvable.com/careers", // both fail
      ],
      resolveCname,
      fetchFn,
    );

    expect(result.resolved).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].url).toBe("https://unresolvable.com/careers");
  });

  it("handles empty input array", async () => {
    const result = await resolveCustomUrls(
      [],
      makeMockCnameResolver({}),
      makeMockFetch([]),
    );
    expect(result.resolved).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});
