# Company Corpus Expansion — Dedicated Session Prompt

## Current Architecture

### Company Discovery Sources (Module B)

1. **HTTP Archive BigQuery Seeder** (`src/lib/jobs/seeders/bigquery-seeder.ts`)
   - Scans HTTP Archive's `crawl_responses` table for ATS API endpoints (Greenhouse, Lever, Ashby)
   - Uses multi-partition scanning (2-3 recent monthly partitions) to stay within free tier limits
   - Extracts `(ats_source, ats_slug)` tuples from URL patterns like:
     - `boards.greenhouse.io/{slug}`
     - `jobs.lever.co/{slug}`
     - `api.ashbyhq.com/{slug}`
   - Deduplicates against existing companies in the DB

2. **HN Algolia Seeder** (`src/lib/jobs/seeders/hn-algolia.ts`)
   - Searches Hacker News "Who is Hiring" threads (monthly)
   - Runs daily for first 7 days of each month, then weekly
   - Extracts company names from job posts and resolves them to ATS slugs via:
     - Direct ATS URL mentions in comments
     - DNS CNAME check + slug probe against ATS APIs for non-ATS URLs
   - Discards URLs that don't resolve to a known ATS

3. **Manual Addition** — Admin-added via dashboard (discovery_source = "manual")

4. **crt.sh (Phase 2, deferred)** — Certificate Transparency stealth seeder

### Company Schema (`src/db/schemas/jobs/company.ts`)
- `atsSource`: greenhouse | lever | ashby
- `atsSlug`: the company's slug on the ATS platform
- `tier`: active (posted in last 14 days) | dormant | dead
- `health`: healthy | degraded | rate_limited | blocked | error | dead
- `lastJobPostedAt`: timestamp of most recent job posting
- `lastHttpStatus`: HTTP status from last poll attempt
- `discoverySource`: httparchive | hn_algolia | crt_sh | hn_custom_url | manual

### Polling Architecture
- **Tier A** (active): posted a job in last 14 days → polled every 12h via `tierActiveFanOut`
- **Tier B** (dormant): no jobs in >14 days → polled weekly via `tierDormantFanOut`
- **Tier C** (dead): endpoint returns 404 or 3+ consecutive failures → stopped
- Daily `tierRecalc` recalculates tiers from `lastJobPostedAt`
- Daily `companyRevivalSweep` re-enables polling for transiently dead companies

### Current Stats (June 28, 2026)
- **449 companies** in the corpus
- **447 Tier A** companies polled every 12h
- **~4,086 active jobs** in the database
- **~29 new jobs/day** in steady state
- **~1-2 approved matches/week** (3 personas, 0.48 Gate 2 threshold)

## The Problem

449 companies is far too small for a viable job matching service. The yield analysis shows:

| Metric | Current (449 companies) | Target (1,800+ companies) |
|---|---|---|
| New jobs/day | ~29 | ~116 |
| New candidates/day | ~2-5 | ~8-20 |
| Approved matches/week | ~1-2 | ~4-8 |

The current seeders are discovering companies, but the rate is too slow:
- BigQuery seeder: limited by free tier partition scanning
- HN seeder: limited to companies mentioned in HN "Who is Hiring" threads
- No other discovery mechanisms are active

## What Needs to Be Solved

### 1. BigQuery Free Tier Optimization
The HTTP Archive BigQuery seeder is constrained by the Google Cloud free tier (1 TB/month of query data). Multi-partition scanning was implemented (scanning 2-3 recent monthly partitions), but we need to:
- Analyze the query costs and optimize further
- Consider scanning specific fields only (not SELECT *) to reduce data scanned
- Explore partition pruning strategies
- Consider using the HTTP Archive's monthly summary tables instead of full crawl data
- Evaluate whether BigQuery sandbox (free, no billing) is sufficient or if we need a paid tier

### 2. New Discovery Sources
We need to explore and implement additional company discovery sources beyond BigQuery and HN:

**a) Direct ATS API Enumeration**
- Greenhouse, Lever, and Ashby all have predictable URL patterns. Can we enumerate slugs?
- Greenhouse: `boards.greenhouse.io/{slug}` — can we discover slugs from their public API?
- Lever: `jobs.lever.co/{slug}` — any directory or search API?
- Ashby: `api.ashbyhq.com/{slug}` — any enumeration possible?
- What are the rate limits and ethical considerations of slug probing?

**b) Job Board Aggregators**
- Can we extract company names from job board aggregators (LinkedIn, Indeed, Glassdoor)?
- These platforms list companies that are hiring — can we cross-reference with ATS slugs?
- What APIs or data sources are available (legally and ethically)?

**c) Company Directories**
- Crunchbase, AngelList/Wellfound, Y Combinator startup directory
- These list companies with their tech stacks and hiring status
- Can we programmatically extract company names and resolve them to ATS slugs?

**d) GitHub/GitLab Discovery**
- Companies often link to their careers page in their GitHub org profile
- Can we scan GitHub orgs for careers page links?
- Can we identify companies using specific tech stacks (e.g., TypeScript repos → likely hiring TS developers)?

**e) Social Media**
- Twitter/X: Companies posting job links
- LinkedIn: Company pages with careers sections
- What APIs are available and what are the rate limits?

**f) Web Crawling (Ethical)**
- Can we crawl company "about" or "careers" pages from a seed list?
- What robots.txt considerations apply?
- How to detect ATS-powered career pages vs custom-built ones?

### 3. ATS Slug Resolution Pipeline
Once we have company names from new sources, we need to resolve them to ATS slugs:
- Current: DNS CNAME check + slug probe (for HN non-ATS URLs)
- Needed: A more robust resolution pipeline that can:
  - Try multiple ATS platforms for each company name
  - Handle company name variations (e.g., "Stripe" vs "Stripe Inc" vs "stripe.com")
  - Cache resolution results to avoid redundant probes
  - Rate-limit probes to avoid being blocked

### 4. Quality Control
Not all companies are worth polling:
- Companies with <5 job postings are low-value
- Companies that haven't posted in >6 months are dead
- Companies using non-standard ATS setups may fail polling
- Need a scoring/filtering mechanism to prioritize high-value companies

### 5. Scaling Considerations
- **Polling load**: 1,800 companies × 2 polls/day = 3,600 polls/day. At 2 req/s per ATS, that's ~30 minutes of polling per cycle. Is this sustainable?
- **Database size**: More companies → more jobs → more embeddings → larger DB. Neon free tier limits?
- **Inngest function concurrency**: More polls = more concurrent Inngest functions. Free plan cap?
- **Embedding costs**: More jobs = more OpenAI embedding API calls. Cost per 1K tokens?

## Key Files to Reference

- `src/lib/jobs/seeders/bigquery-seeder.ts` — BigQuery seeder implementation
- `src/lib/jobs/seeders/hn-algolia.ts` — HN Algolia seeder implementation
- `src/lib/jobs/seeders/company-repository.ts` — Company upsert + discovery logic
- `src/lib/jobs/ats-endpoints.ts` — ATS API endpoint definitions
- `src/db/schemas/jobs/company.ts` — Company schema
- `src/db/schemas/jobs/enums.ts` — ATS source, tier, health, discovery source enums
- `src/inngest/functions.ts` — All Inngest functions (pollers, seeders, sweeps)
- `scripts/seed-bigquery.ts` — BigQuery seeder script
- `docs/governing/VectorMatchTechicalImplementation.md` — Technical implementation docs
- `AGENTS.md` — Project rules and conventions

## Success Criteria

1. **1,800+ companies** in the corpus within 2 months
2. **At least 3 new discovery sources** implemented beyond BigQuery and HN
3. **Polling infrastructure** scales to handle 3,600+ polls/day without degradation
4. **Quality filtering** ensures >70% of discovered companies have active job postings
5. **Cost-neutral** — stays within free tiers (BigQuery, Neon, Inngest, OpenAI)
6. **No manual intervention** — all discovery and resolution is automated

## Session Goals

In the dedicated session, we should:
1. **Brainstorm and prioritize** new discovery sources based on feasibility, cost, and yield
2. **Design the architecture** for the new discovery pipeline
3. **Implement the highest-priority discovery source** end-to-end
4. **Optimize the BigQuery seeder** for better free tier utilization
5. **Implement quality scoring** for discovered companies
6. **Test the scaling** of the polling infrastructure
7. **Create a rollout plan** for gradually increasing the corpus from 449 → 1,800+
