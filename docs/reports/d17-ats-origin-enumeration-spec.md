# ATS-Origin Enumeration — Design Spec

**Directive 17, Part D2**
**Date:** 2026-07-17
**Status:** Spec complete — August build

---

## Problem

The aggregator paradox: anything findable via search engines is already saturated. Discovery advantage must be BUILT at the origin layer — the ATS itself. No search engine, no aggregator, no SEO gravity between us and the source.

## Method

Enumerate Greenhouse, Lever, and Ashby board IDs at census scale by probing their public API endpoints. Each ATS has a predictable URL pattern:

| ATS | Board URL Pattern | API Endpoint | Jobs Path |
|-----|-------------------|--------------|-----------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` | JSON API | `jobs[].id` |
| Lever | `api.lever.co/v0/postings/{slug}` | JSON API | `postings[].id` |
| Ashby | `api.ashby.com/v1/jobs/{slug}` | JSON API (POST) | `jobs[].id` |

### Step 1: Board ID Generation

Generate candidate slugs from multiple sources:
1. **Company website domain → slug heuristic**: `example.com` → `example` (strip TLD, try as slug)
2. **Certstream careers-subdomain CNAME records**: when a CNAME points to `boards.greenhouse.io`, extract the subdomain prefix as the slug
3. **crt.sh certificate transparency logs**: query for certificates issued to `boards.greenhouse.io`, `jobs.lever.co`, `api.ashby.com` — the SAN (Subject Alternative Names) contain the board slug
4. **Existing company table**: 9,153 companies already have `ats_slug` values — use these as the known set, enumerate the complement

### Step 2: Probe (HTTP HEAD or minimal GET)

For each candidate slug, probe the ATS API:
- **Greenhouse**: `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` → 200 = valid board, 404 = invalid
- **Lever**: `GET https://api.lever.co/v0/postings/{slug}` → 200 = valid, 404 = invalid
- **Ashby**: `POST https://api.ashby.com/v1/jobs/{slug}` with `{}` body → 200 = valid, 404 = invalid

Rate limit: 2 req/s per ATS (matching existing `bottleneck` config). With 3 ATS sources in parallel, effective throughput is 6 req/s.

### Step 3: JSON-LD Scope Filter

For each valid board, fetch the first 5-10 job detail pages and parse JSON-LD `<script type="application/ld+json">` blocks. The D16 JSON-LD pilot showed 26% coverage — enough to filter the most obvious country-fenced boards. Apply:
- `jobLocationType === "TELECOMMUTE"` + no `applicantLocationRequirements` → global candidate
- `applicantLocationRequirements` contains a country → country-fenced, skip

### Step 4: v3 Fingerprint Probe

For boards that pass the JSON-LD filter, run the v3 fingerprint probe (`probeStackProfileV3`) to verify the board has web-dev jobs (≥2 persona-defining tags in the first 50 jobs). This is the gate that was never wired in (D17 D1 finding) — it must be connected before this step works.

### Step 5: Yield Ranking & Enrollment

Boards that pass all filters are enrolled via the Slugger with:
- `discoverySource = "ats_census"` (new enum value needed)
- `tier = "probation"` (standard probation flow)
- `polling_enabled = true` (after Aug 1 reset)

## Scale Estimate

| Source | Estimated Boards | Probe Cost | Time at 2 req/s |
|--------|-----------------|------------|-----------------|
| Greenhouse | ~5,000-8,000 | 1 HTTP req each | ~40-65 min |
| Lever | ~3,000-5,000 | 1 HTTP req each | ~25-40 min |
| Ashby | ~1,000-2,000 | 1 HTTP req each | ~8-15 min |
| **Total** | ~9,000-15,000 | ~15K HTTP reqs | ~75-120 min |

The probe can run in the August batch window (0am-7am, 7 hours available). At 6 req/s (3 ATS in parallel), 15,000 probes take ~42 minutes.

**Expected yield:** If 30% of probed boards are valid and 20% of those have web-dev jobs with global scope, that's ~540-900 new boards — a 6-10x expansion over the current 9,153 company corpus.

## Probe Cost

- **HTTP requests:** ~15,000 (free — ATS APIs are public, no auth required)
- **LLM calls:** 0 (all filtering is deterministic: JSON-LD parsing + tag regex)
- **Neon compute:** ~0.5-1.0 CU-hr (one batch insert of discovered boards)
- **Total:** Negligible — the probe runs in one batch window

## August Build Plan

| Week | Task | Deliverable |
|------|------|-------------|
| 1 | Board ID generation from crt.sh + certstream + domain heuristic | ~50K candidate slugs |
| 1 | Probe infrastructure (rate-limited, parallel, retry) | Probe script + Inngest function |
| 2 | Run the census probe (one batch window) | ~15K valid boards discovered |
| 2 | JSON-LD scope filter + v3 fingerprint probe | ~540-900 enrollable boards |
| 3 | Enroll via Slugger with `ats_census` discovery source | New companies in DB |
| 3 | Yield tracking: jobs/day per new board vs existing boards | Scoreboard v2 |

## Dependencies

1. **v3 fingerprint probe must be wired in** (D17 D1 finding #4) — `probeStackProfileV3` is defined but never called. This is a prerequisite for Step 4.
2. **`discovery_source` enum needs `ats_census` value** — currently missing (D17 D1 finding #2 shows `certstream` is also missing).
3. **August 1 Neon reset** — the census probe is a heavy batch job that should run in the first August window when 100 CU-hrs are available.

## Why This Channel Cannot Be Mainstream

By the time a company's job board appears in search results or on an aggregator, it's already saturated. The ATS-origin enumeration discovers boards that:
- Have never been indexed by Google (no inbound links yet)
- Are hours old (certstream CNAME records appear when the board is created)
- Have no SEO presence (the ATS API is a JSON endpoint, not a crawlable page)

This is the original L2 mandate — "systematic built pipeline, not agent recall" — executed at the origin layer.
