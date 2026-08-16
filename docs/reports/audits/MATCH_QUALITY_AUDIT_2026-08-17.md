# Match Quality Audit Report — 2026-08-17

## Executive Summary

A comprehensive quality audit of all 81 match rows associated with the founder's three personas reveals systemic matching quality issues across every audit dimension. The pipeline is functional (jobs are being ingested, embedded, and evaluated) but the quality of matches reaching the dashboard is poor: **at least 9 of 34 dashboard-visible approved matches (26%) are clear false positives** with wrong stack families or wrong role families. An additional 15 approved matches are "ghost approvals" — approved by Gate 3 but hidden by the serve-time gate because they are geo-fenced, representing wasted OpenAI API calls.

The three root causes are:

1. **GATE2_HARD_CEILING = 0.75 is far too permissive** — it allows jobs with only 25% semantic similarity to enter the queue. 68% of all matches have cosine similarity ≤ 0.45 (distance ≥ 0.55), and **zero matches have strong semantic similarity** (distance < 0.40).

2. **Gate 3's LLM prompt is too permissive on stack alignment** — the "missing tags are a soft signal" rule and the narrow "PRIMARY STACK FROM TITLE" hard blocker allow platform-named roles (SharePoint, Magento) and backend-heavy roles (Kotlin/Spring, Go/Rust, Python/FastAPI) to be approved for frontend/full-stack JS personas.

3. **The remote_scope classifier produces false-globals** — at least 2 dashboard-visible approved matches have geographic restrictions in their title or location ("Remote - Costa Rica", "Berlin, Germany, EMEA, Remote") but are classified as `remote_scope = global`, bypassing the geo-fence filter.

The user's reported symptoms are confirmed: geo-fenced opportunities are appearing (false-global classification), many jobs are poorly matched (wrong stack/role family), and duplicate listings exist (same-source reposts with different text hashes).

---

## Scope and Methodology

### Scope

All match rows in `match_queue` associated with the founder's three personas:

| Persona | Must-Have Tags |
|---|---|
| React / GraphQL Frontend Engineer | `{typescript, react, nextjs, graphql, tailwindcss}` |
| PHP/Laravel Full-Stack Developer | `{php, laravel, mysql, wordpress, javascript}` |
| Next.js / AI Full-Stack Engineer | `{typescript, nextjs, react, nodejs, prompt-engineering}` |

### Methodology

1. Extracted all 81 match rows from production PostgreSQL with full job + persona metadata.
2. Ran structured aggregation queries for counts by status, source, remote_scope, fence flags, overlap buckets, and cosine distance buckets.
3. Identified multi-persona matches and cross-source reposts.
4. Verified serve-time gate behavior against persisted flags.
5. Reviewed the Gate 1+2 SQL router (`src/lib/jobs/gate-1-2.ts`), the serve-time gate filter (`src/lib/jobs/dashboard-queries.ts`), the Gate 3 system prompt (`src/lib/jobs/gate-3.ts`), and the matching configuration (`src/lib/jobs/matching-config.ts`).
6. Classified each dashboard-visible approved match by stack alignment, role alignment, and geo-fence correctness.

### Production environment

- **Database:** PostgreSQL 17 in Docker container `z10g6zz09soe0ddwgpizteq2` on Hetzner VPS (157.180.68.189)
- **Queries executed:** `ssh vectormatch-vps "docker exec ... psql ..."`
- **Audit date:** 2026-08-17
- **Last deployment:** commit `4d422ed` (post OpenAI credit fix)

---

## Dataset Counts

### By status

| Status | Count | Read | Distinct Jobs |
|---|---|---|---|
| approved | 49 | 32 | 33 |
| rejected | 20 | 0 | 18 |
| mismatch | 11 | 0 | 7 |
| applied | 1 | 0 | 1 |
| **Total** | **81** | **32** | **59** |

### By remote_scope

| Remote Scope | Total | Approved | Approved (Unread) |
|---|---|---|---|
| global | 62 | 34 | 17 |
| country_fenced | 18 | 14 | 0 |
| region_fenced | 1 | 1 | 0 |

### By source

| ATS Source | Total Matches | Approved | Rejected | Mismatch |
|---|---|---|---|---|
| weworkremotely | 41 | 34 | 3 | 3 |
| ashby | 30 | 12 | 12 | 6 |
| greenhouse | 4 | 0 | 2 | 2 |
| remoteok_direct | 3 | 2 | 1 | 0 |
| lever | 1 | 0 | 1 | 0 |
| larajobs | 1 | 1 | 0 | 0 |
| remotive | 1 | 0 | 1 | 0 |

### By overlap score

| Overlap | Count | Approved |
|---|---|---|
| 2 (minimum) | 56 | 34 |
| 3 | 17 | 10 |
| 4+ | 8 | 5 |

### By cosine distance

| Distance Bucket | Count | Approved |
|---|---|---|
| < 0.40 (strong) | 0 | 0 |
| 0.40–0.45 | 0 | 0 |
| 0.45–0.50 | 7 | 5 |
| 0.50–0.55 (borderline) | 19 | 13 |
| ≥ 0.55 (weak) | 55 | 31 |

**No matches have strong semantic similarity.** The best cosine similarity in the entire dataset is ~0.53 (distance ~0.47). The majority (68%) are in the "weak" bucket with similarity ≤ 0.45.

### By fence flags

| is_fenced | is_natsec | is_qa | Count | Approved |
|---|---|---|---|---|
| NULL | NULL | NULL | 44 | 36 |
| false | false | false | 36 | 12 |
| true | false | false | 1 | 1 |

44 matches (54%) have NULL fence flags — these are older jobs that were ingested before the D17 flag materialization and haven't been backfilled.

### Serve-time gate behavior

| Serve-Time Gate | Status | Count | Unread |
|---|---|---|---|
| PASSES | approved | 34 | 17 |
| PASSES | mismatch | 11 | 11 |
| PASSES | rejected | 16 | 16 |
| PASSES | applied | 1 | 1 |
| BLOCKED | approved | 15 | 0 |
| BLOCKED | rejected | 4 | 4 |

**15 approved matches are "ghost approvals"** — approved by Gate 3 but hidden from the dashboard by the serve-time gate because they are country_fenced or region_fenced. These represent wasted OpenAI API calls.

---

## Geo-Fencing Findings

### Finding G1: 15 ghost approvals on non-global jobs (Severity: MEDIUM)

15 matches have `status = approved` but `remote_scope != 'global'` (14 country_fenced + 1 region_fenced). The serve-time gate correctly hides them from the dashboard, but:

- Each consumed a Gate 3 LLM call (OpenAI API cost).
- They clutter the `match_queue` table with invisible approved rows.
- The user cannot see or dismiss them through the dashboard UI.

**Root cause:** These rows were evaluated by Gate 3 before the `jm.remote_scope = 'global'` filter was added to the Gate 1+2 SQL router (Directive 09, Part A.1). The Gate 1+2 router now filters at the SQL level, but historical rows persist. The `ON CONFLICT` clause preserves terminal statuses (approved, mismatch, rejected, applied) on re-ingestion, so these ghost approvals survive re-evaluation.

**Examples:**

| Title | Source | Location | Remote Scope | Persona |
|---|---|---|---|---|
| Senior React Full stack Developer | remoteok_direct | (empty) | country_fenced | React/GraphQL, Next.js/AI |
| FULL TIME: Software Engineer Position - React and Rest | weworkremotely | Anywhere in the World | country_fenced | React/GraphQL, Next.js/AI |
| AI Engineer II (Remote) | weworkremotely | Anywhere in the World | country_fenced | Next.js/AI (×2) |
| Senior Full Stack AI Engineer | weworkremotely | Anywhere in the World | country_fenced | Next.js/AI |
| (larajobs job) | larajobs | Remote / Europe | region_fenced | PHP/Laravel |

### Finding G2: False-global classification — 2 dashboard-visible matches with geographic restrictions (Severity: HIGH)

Two approved matches that **pass the serve-time gate** and appear on the dashboard have geographic restrictions visible in their title or location, but are classified as `remote_scope = global`:

1. **Software Engineer, Fullstack** at SimSpace (ashby)
   - Location: `Remote - Costa Rica`
   - `remote_scope = global` (false classification)
   - The location string explicitly names Costa Rica, but the classifier marked it global.
   - Match ID: `a1d8cb39-fcb9-44f9-be13-84dbc672dc75`
   - Matched to: React / GraphQL Frontend Engineer

2. **Senior Fullstack Engineer (f/m/d) - Berlin I Germany, EMEA I Remote** (weworkremotely)
   - Title contains: `Berlin I Germany, EMEA I Remote`
   - `remote_scope = global` (false classification)
   - The title explicitly restricts to EMEA/Germany, but the classifier marked it global.
   - Match IDs: `8ca1a61a-653c-475b-bfcc-823201e1a02f`, `c4996808-67bf-4c38-acc5-19b385c6e79b`
   - Matched to: Next.js/AI (both personas)

**Root cause:** The remote_scope classifier's regex/pattern matching does not catch "Remote - Costa Rica" (single-country remote in the location field) or "EMEA I Remote" (region restriction in the title field). The Gate 1+2 router's inline regex fallback (`gate-1-2.ts` lines 264–284) checks for country names and region terms in `location_name`, but the pattern for "Remote - [Country]" requires the country to be in a specific list — Costa Rica is not in the list at line 269. The EMEA check at line 277 checks `location_name`, not `title` — so "EMEA I Remote" in the title is missed.

### Finding G3: 44 matches with NULL fence flags (Severity: LOW)

44 of 81 matches (54%) have `is_fenced = NULL`, `is_natsec = NULL`, `is_qa = NULL`. These are older jobs ingested before the D17 flag materialization. The serve-time gate uses `IS NOT TRUE` semantics, which treats NULL as not-fenced (permissive), so these rows pass the gate. This is the correct behavior per the code comments, but it means the fence flag backfill has not been completed for these jobs.

---

## Match-Quality Findings

### Finding Q1: 9 clear false positives among 34 dashboard-visible approved matches (Severity: HIGH)

At least 9 of the 34 approved matches visible on the dashboard (26%) are clear false positives where the primary stack or role family does not match the persona:

| # | Title | Source | Persona | Overlap | Cosine Sim | Issue |
|---|---|---|---|---|---|---|
| 1 | Senior Sharepoint Developer | weworkremotely | Next.js/AI | 2 | 0.3853 | SharePoint is a Microsoft/.NET platform; tags include csharp, azure. React/TS are ancillary. |
| 2 | Senior Sharepoint Developer | weworkremotely | React/GraphQL | 2 | 0.3935 | Same as above. Wrong stack family. |
| 3 | Senior Magento Developer | weworkremotely | React/GraphQL | 3 | 0.4202 | Magento is a PHP e-commerce platform. Matched to a JS frontend persona on graphql/tailwindcss/react overlap. |
| 4 | Senior Software Engineer (EAA) | weworkremotely | React/GraphQL | 2 | 0.3700 | DevOps role (kubernetes, terraform, aws, grpc). React/graphql are secondary. Weakest cosine sim in the set. |
| 5 | Nuuly Senior Software Engineer | weworkremotely | Next.js/AI | 2 | 0.4529 | JVM/Kotlin/Spring backend role. TypeScript and prompt-engineering are ancillary. |
| 6 | Partner Solution Architect (AWS) | ashby (supabase) | React/GraphQL | 2 | 0.4141 | Solutions architect role, not a developer role. |
| 7 | Partner Solution Architect (AWS) | ashby (supabase) | Next.js/AI | 2 | 0.4170 | Same as above. |
| 8 | Senior AI Engineer | weworkremotely | Next.js/AI | 4 | 0.4433 | Python/AI backend role with a suspiciously broad tag list (30+ tags including ios, android, swift, flutter). Lemon.io talent platform job. |
| 9 | AI Product Engineer - ClickStack | weworkremotely | Next.js/AI | 2 | 0.4100 | Go/Rust/Kubernetes backend role. TypeScript/nodejs are secondary. |

**Additional borderline false positives (likely wrong but defensible):**

| # | Title | Source | Persona | Overlap | Cosine Sim | Issue |
|---|---|---|---|---|---|---|
| 10 | Software Engineer, Fullstack | ashby (simspace) | React/GraphQL | 2 | 0.4228 | Kotlin/Spring-boot backend role. TS/React are secondary. Also geo-fenced to Costa Rica (false-global). |
| 11 | Staff Software Engineer - Experimentation | ashby (headway) | Next.js/AI | 2 | 0.4334 | Python/FastAPI backend role. TS/React are secondary. |
| 12 | Staff Software Engineer - Experimentation | ashby (headway) | React/GraphQL | 2 | 0.4369 | Same as above. |
| 13 | Senior Software Engineer | weworkremotely (coinbase) | Next.js/AI | 2 | 0.4469 | Generic title but tags are {frontend, react, typescript, go}. Go is the primary backend. Borderline. |

### Finding Q2: GATE2_HARD_CEILING = 0.75 is far too permissive (Severity: HIGH)

The `GATE2_HARD_CEILING` (default 0.75) allows jobs with cosine similarity as low as 0.25 (distance 0.75) to enter the match queue in rank-only mode. The actual data shows:

- **0% of matches have strong semantic similarity** (distance < 0.40, similarity > 0.60)
- **0% have moderate similarity** (distance 0.40–0.45, similarity 0.55–0.60)
- **9% have borderline-strong similarity** (distance 0.45–0.50, similarity 0.50–0.55)
- **23% are borderline** (distance 0.50–0.55, similarity 0.45–0.50)
- **68% are weak** (distance ≥ 0.55, similarity ≤ 0.45)

The `GATE2_MAX_COSINE_DISTANCE` of 0.55 was the original hard threshold, but the D18 "rank-only" re-architecture widened the effective ceiling to 0.75. This means the Gate 2 semantic filter is effectively disabled — any job that passes the hard filters (scope, fence, stack-disjoint) and has ≥2 tag overlap enters the queue regardless of semantic relevance.

The calibration report (`docs/reports/calibration-report.md` §8) previously identified that the 0.50–0.55 bucket had only a 2.9% approval rate (likely false positives). The current data confirms this: the weak-similarity bucket (≥0.55 distance) contains 55 matches, of which 31 were approved by Gate 3 — a 56% approval rate for jobs with ≤45% semantic similarity.

### Finding Q3: Gate 3 prompt approves wrong-stack roles (Severity: HIGH)

The Gate 3 system prompt (`src/lib/jobs/gate-3.ts` lines 131–181) has two rules intended to prevent wrong-stack approvals:

1. **Criterion 1** (line 136): "Missing tags are a soft signal, not a hard blocker; the description is the source of truth." — This explicitly tells the LLM to look beyond the extracted tags and find any mention of relevant technologies in the job description. This is the primary enabler of false positives: a SharePoint job description that mentions "JavaScript" or "React" somewhere gets approved for a React persona.

2. **Criterion 1, PRIMARY STACK FROM TITLE** (line 137): "If the job TITLE explicitly names a specific programming language/framework... and that technology is NOT in the persona's must-have tags, this is a HARD BLOCKER." — This rule only triggers for "programming language/framework" names. It does **not** cover:
   - Platform names: "SharePoint Developer", "Magento Developer", "Shopify Developer"
   - Infrastructure names: "AWS Solution Architect", "Kubernetes Engineer"
   - Role names: "Mobile Engineer (React Native)"

   The rule's narrow scope means most wrong-stack false positives bypass it.

3. **Criterion 6** (line 153): "Domain relevance" — "A React developer persona should match a SaaS frontend job, not a React Native game dev job." — This is a soft criterion, not a hard blocker. The LLM can override it.

The LLM's reasoning for the SharePoint approval (match `9c377374`):
> "The job aligns well with the applicant's skill set, particularly in JavaScript, TypeScript, and React. While it focuses primarily on SharePoint development, the broad experience and compliance enable a strong match."

This reasoning explicitly acknowledges the wrong stack but approves anyway because the prompt's "soft signal" rule overrides the stack mismatch.

### Finding Q4: Stack-disjoint check doesn't cover all platform families (Severity: MEDIUM)

The Gate 1+2 SQL router (`src/lib/jobs/gate-1-2.ts` lines 49–57) defines stack families for JS, PHP, Ruby, Java, .NET, Python, Go, Rust, and C++. The stack-disjoint check rejects jobs where the persona's must-have tags belong to a family and the job has zero tags from that family.

However, the check has gaps:

1. **SharePoint** is a .NET/Microsoft platform, but the job's extracted tags include `javascript, typescript, react` (JS family tags). The JS-family disjoint check passes because the job has JS tags, even though the job's PRIMARY stack is .NET/SharePoint. The check doesn't verify that the JS tags are the PRIMARY stack — it only checks for presence.

2. **Magento** is a PHP platform, but the job's tags include `graphql, tailwindcss, react` (JS family tags). The PHP-family disjoint check would only trigger if the persona is PHP and the job has zero PHP tags — but here the persona is JS and the job has JS tags, so the check passes.

3. **React Native** is a mobile framework. The job's tags include `react, javascript, typescript` (JS family tags). The JS-family disjoint check passes. There is no "mobile vs web" disjoint check.

The stack-disjoint check prevents completely unrelated stacks (e.g., Ruby job vs JS persona with zero JS tags) but cannot catch "wrong primary stack within the same broad family."

### Finding Q5: 56 of 81 matches (69%) have minimum overlap score of 2 (Severity: MEDIUM)

The `GATE1_MIN_OVERLAP = 2` threshold means a job needs only 2 overlapping must-have tags to pass Gate 1. With 5-tag personas, this means a job only needs 40% tag overlap. Combined with the permissive Gate 2 ceiling, this allows jobs with weak tag overlap AND weak semantic similarity to reach Gate 3.

The data shows that 56 of 81 matches (69%) have the minimum overlap of 2, and only 8 (10%) have overlap of 4+. The 2-tag minimum was set based on July 2026 mismatch analysis (when 1-tag overlaps were the problem), but 2-tag overlaps are still producing false positives when the overlapping tags are generic (typescript, react) and the job's primary stack is different.

### Finding Q6: Status/verdict discrepancy — 11 user-marked mismatches with LLM approval (Severity: LOW — informational)

11 rows have `status = mismatch` but `llm_verdict = approved`. These are cases where Gate 3 approved the match, but the user later marked it as a mismatch through the dashboard. This is a legitimate state transition, not an integrity bug:

- The `llm_verdict` field records the LLM's original evaluation.
- The `status` field records the current lifecycle state, which can be changed by user action.
- The D23 terminal-status preservation logic ensures these rows aren't reset to `pending` on re-ingestion.

The 11 user-marked mismatches with LLM approval represent a **false-positive rate of at least 22%** (11 of 49 LLM-approved matches were later marked as mismatch by the user). This is consistent with the 26% false-positive rate identified in Finding Q1 among dashboard-visible approved matches.

---

## Duplicate Findings

### Finding D1: No cross-source duplicates by text_hash (Severity: NONE — working correctly)

The cross-source deduplication by `text_hash` (Gate 1+2 router lines 385–393) is working correctly. Zero duplicate clusters were found where the same `text_hash` appears across different job IDs. This means the same job content is not being ingested from multiple ATS platforms and creating duplicate matches.

### Finding D2: 2 same-source reposts with different text hashes (Severity: LOW)

Two job titles appear as distinct job IDs with different `text_hash` values from the same source:

1. **AI Engineer II (Remote)** — 2 job IDs from weworkremotely
   - `ac240e43-...` (text_hash: `064693...`)
   - `82b387a4-...` (text_hash: `c0204a...`)
   - URLs: `.../sezzle-ai-engineer-ii-remote` and `.../sezzle-ai-engineer-ii-remote-1`
   - Both matched to Next.js/AI persona (both approved)

2. **AI Product Engineer - ClickStack** — 2 job IDs from weworkremotely
   - `cd641ec4-...` (text_hash: `a9b648...`)
   - `cde48ddd-...` (text_hash: `d85c11...`)
   - URLs: `.../clickhouse-ai-product-engineer-clickstack` and `.../clickhouse-ai-product-engineer-clickstack-1`
   - Both matched to Next.js/AI persona (both approved)

These are reposts of the same job at different times (WeWorkRemotely appends `-1` to the URL for reposts). The content changed slightly between reposts, producing different `text_hash` values. The cross-source dedup by `text_hash` does not catch these because the hashes are different.

**Impact:** The user sees the same job twice on the dashboard (once per repost). This is a minor UX issue, not a data integrity issue.

### Finding D3: 30 multi-persona matches — mostly legitimate, some problematic (Severity: MEDIUM)

30 jobs are matched to more than one persona. Most are legitimate multi-persona matches (a React/Next.js job genuinely fits both the React/GraphQL and Next.js/AI personas). However, some multi-persona matches expose overly broad matching:

| Title | Personas | Statuses | Issue |
|---|---|---|---|
| Senior Sharepoint Developer | React/GraphQL, Next.js/AI | approved, approved | Wrong stack for both personas |
| Senior Magento Developer | PHP/Laravel, React/GraphQL | approved, approved | Correct for PHP, wrong for React/GraphQL |
| Senior Mobile Engineer (React Native) | React/GraphQL, Next.js/AI | mismatch, mismatch | User marked both as mismatch |
| Senior AI Engineer | Next.js/AI, React/GraphQL, PHP/Laravel | approved, mismatch, mismatch | Correct for Next.js/AI, wrong for others |
| Partner Solution Architect (AWS) | React/GraphQL, Next.js/AI | approved, approved | Architect role, not developer |

The multi-persona matching is working as designed (a job can match multiple personas), but the quality of the per-persona evaluation varies. The same job can be a strong match for one persona and a false positive for another, and Gate 3 approves both.

---

## Pipeline and Data-Integrity Findings

### Finding P1: 15 ghost approvals consuming resources (Severity: MEDIUM)

As documented in Finding G1, 15 approved matches are hidden by the serve-time gate. These rows:
- Consumed Gate 3 LLM calls (OpenAI API cost).
- Cannot be seen or dismissed by the user.
- Will survive re-ingestion due to the D23 terminal-status preservation.
- Should be periodically purged or re-evaluated when the remote_scope classifier is updated.

### Finding P2: Historical rows with NULL fence flags (Severity: LOW)

44 matches have NULL fence flags. The serve-time gate's `IS NOT TRUE` semantics correctly handle these (treating NULL as not-fenced), but:
- The Gate 1+2 router's `COALESCE(is_fenced, regex_fallback, false)` logic applies the regex fallback for NULL flags, which may produce different results than the materialized flag.
- A fence-flag backfill would eliminate this ambiguity and allow the regex fallback to be removed.

### Finding P3: WeWorkRemotely dominates the match pool (Severity: LOW — informational)

WeWorkRemotely accounts for 41 of 81 matches (51%) and 34 of 49 approvals (69%). This source concentration means the matching quality is heavily dependent on WeWorkRemotely's job quality and the normalizer's ability to extract accurate tags from WeWorkRemotely postings. Several false positives (SharePoint, Magento, Shopify) come from Proxify AB postings on WeWorkRemotely, which appear to be a talent agency posting a wide variety of roles.

### Finding P4: The larajobs auto-approved bypass (Severity: MEDIUM)

One match (match ID `22c8e0fa`) has `llm_confidence = 0.75` and reasoning:
> "Auto-approved: Gate 1+2 passed (tag overlap + embedding similarity < 0.50). Gate 3 bypassed due to Inngest signature validation issue."

This row was auto-approved without LLM evaluation due to an Inngest signature validation issue. The job is a larajobs posting with `remote_scope = region_fenced` (Remote / Europe) and `is_fenced = true`, so it is correctly hidden by the serve-time gate. However, the auto-approval bypass is a concerning pattern — if it occurred for a false-global job, it would reach the dashboard without LLM review.

The Inngest signature validation issue was resolved by the D27 pg-boss migration, so this bypass should not recur for new matches.

---

## Root Cause Summary

| # | Root Cause | Severity | Affected Findings |
|---|---|---|---|
| RC1 | `GATE2_HARD_CEILING = 0.75` is far too permissive — allows 25% semantic similarity | HIGH | Q2, Q1 |
| RC2 | Gate 3 prompt's "missing tags are a soft signal" rule overrides stack mismatches | HIGH | Q3, Q1 |
| RC3 | "PRIMARY STACK FROM TITLE" hard blocker doesn't cover platform names (SharePoint, Magento, Shopify) or role names (Architect, Mobile) | HIGH | Q3, Q1 |
| RC4 | remote_scope classifier misses "Remote - Costa Rica" and "EMEA I Remote" in title/location | HIGH | G2 |
| RC5 | Stack-disjoint check can't detect wrong primary stack within the same broad family | MEDIUM | Q4, Q1 |
| RC6 | `GATE1_MIN_OVERLAP = 2` allows 40% tag overlap with generic tags | MEDIUM | Q5 |
| RC7 | Historical ghost approvals persist due to terminal-status preservation | MEDIUM | G1, P1 |
| RC8 | Same-source reposts produce different text_hashes, bypassing dedup | LOW | D2 |
| RC9 | Fence-flag backfill incomplete for 44 older jobs | LOW | G3, P2 |

---

## Recommended Next Actions

The following actions are proposed for a future directive. They are **not** implemented in this audit — they require explicit user approval.

### Priority 1: Tighten Gate 2 ceiling (addresses RC1, Q2, Q1)

**Option A (conservative):** Set `GATE2_HARD_CEILING = 0.55` (revert to the pre-D18 threshold as the hard ceiling). This would filter 55 of 81 matches (68%) before they reach Gate 3. The 26 remaining matches would have semantic similarity ≥ 0.45.

**Option B (aggressive):** Set `GATE2_HARD_CEILING = 0.50`. This would filter 74 of 81 matches (91%), leaving only the 7 matches with similarity ≥ 0.50. This may be too aggressive and reduce yield significantly.

**Recommendation:** Option A (0.55) as the new hard ceiling, with `GATE2_RANK_ONLY = true` retained for ranking within the ceiling. Monitor yield and false-positive rate for 1–2 weeks before further tightening.

### Priority 2: Strengthen Gate 3 stack-alignment rules (addresses RC2, RC3, Q3, Q1)

1. **Expand "PRIMARY STACK FROM TITLE" to include platform names:** Add SharePoint, Magento, Shopify, WordPress, Drupal, Webflow, Salesforce, ServiceNow, and other platform names to the hard-blocker rule. If the title names a platform that is not in the persona's must-have tags, reject.

2. **Add role-family hard blocker:** If the title contains "Architect", "Mobile", "React Native", "iOS", "Android", "DevOps", "SRE", "Platform Engineer", and the persona is a web/frontend/full-stack persona without those in must-have tags, reject as a hard blocker.

3. **Soften the "missing tags are a soft signal" rule:** Change from "soft signal, not a hard blocker" to "soft signal — if the job's PRIMARY stack (inferred from title + majority of extracted tags) does not include at least 2 of the persona's must-have tags, this is a hard blocker."

### Priority 3: Fix remote_scope classifier for false-globals (addresses RC4, G2)

1. **Add Costa Rica and other missing countries** to the location regex in `gate-1-2.ts` line 269.
2. **Check the title field for region terms** (EMEA, APAC, LATAM, etc.), not just the location field. Currently the regex at line 277 only checks `location_name`.
3. **Add "Remote - [Country]" pattern** to the title regex, not just the location regex.

### Priority 4: Purge ghost approvals (addresses RC7, G1, P1)

Run a one-time cleanup query to set `status = 'rejected'` for all approved matches where `remote_scope != 'global'`. This will:
- Remove 15 invisible approved rows from the match queue.
- Free up the rows for re-evaluation if the remote_scope classifier is later corrected.
- Require explicit user approval before execution (data mutation).

### Priority 5: Add same-source repost dedup (addresses RC8, D2)

Add a dedup check in the Gate 1+2 router that blocks a new job from matching a persona if another job with the same `(ats_source, ats_slug, title)` (ignoring URL suffixes like `-1`, `-2`) is already approved for that persona. This extends the existing cross-posting dedup (lines 373–380) to handle reposts.

### Priority 6: Backfill fence flags (addresses RC9, G3, P2)

Run a one-time backfill to populate `is_fenced`, `is_natsec`, `is_qa` for all jobs with NULL flags, using the same COALESCE regex logic from `gate-1-2.ts`. This eliminates the NULL ambiguity and allows the regex fallback to be removed from the Gate 1+2 router.

### Priority 7: Consider raising GATE1_MIN_OVERLAP to 3 (addresses RC6, Q5)

Raising the minimum overlap from 2 to 3 would filter 56 of 81 matches (69%) at the SQL level. This is aggressive but would dramatically reduce false positives. Consider as an optional lever if Priority 1+2 don't sufficiently reduce the false-positive rate.

---

## Proposed Decisions for Future Directive

The user should consider the following decisions:

1. **Should GATE2_HARD_CEILING be tightened from 0.75 to 0.55?** This is the highest-impact single change — it would filter 68% of weak matches before they reach Gate 3, saving OpenAI costs and reducing false positives.

2. **Should the Gate 3 prompt be updated with stronger stack-alignment rules?** Specifically: expanding the "PRIMARY STACK FROM TITLE" hard blocker to include platform names and role families, and softening the "missing tags are a soft signal" rule.

3. **Should the remote_scope classifier be patched for the identified false-global patterns?** Specifically: adding missing countries to the regex, checking the title field for region terms, and adding "Remote - [Country]" title patterns.

4. **Should ghost approvals be purged?** A one-time cleanup of 15 approved matches with non-global remote_scope, setting them to rejected. This is a data mutation and requires explicit approval.

5. **Should same-source repost dedup be added?** Extending the cross-posting dedup to handle reposts with different text_hashes but the same title/source.

6. **Should a fence-flag backfill be run?** Populating NULL fence flags for 44 older jobs to eliminate ambiguity.

7. **Should GATE1_MIN_OVERLAP be raised from 2 to 3?** Optional aggressive lever to reduce false positives at the SQL level.

---

## Appendix A: All 34 Dashboard-Visible Approved Matches

| # | Title | Source | Persona | Overlap | Sim | Read | Quality |
|---|---|---|---|---|---|---|---|
| 1 | Member of the Technical Staff, Internal Agent | weworkremotely | React/GraphQL | 2 | 0.39 | No | Strong (Vercel/Next.js) |
| 2 | Member of the Technical Staff, Internal Agent | weworkremotely | Next.js/AI | 2 | 0.49 | No | Strong (Vercel/Next.js) |
| 3 | Software Engineer, Fullstack | ashby (simspace) | React/GraphQL | 2 | 0.42 | No | **False positive** (Kotlin/Spring + false-global Costa Rica) |
| 4 | Staff Software Engineer (Journeys) | ashby (headway) | Next.js/AI | 3 | 0.42 | No | Borderline (Python/FastAPI primary) |
| 5 | Staff Software Engineer - Experimentation | ashby (headway) | Next.js/AI | 2 | 0.43 | No | **False positive** (Python/FastAPI primary) |
| 6 | Staff Software Engineer - Experimentation | ashby (headway) | React/GraphQL | 2 | 0.44 | No | **False positive** (Python/FastAPI primary) |
| 7 | Staff Software Engineer - Insurance | ashby (headway) | React/GraphQL | 3 | 0.39 | No | Borderline (Python/FastAPI but has Next.js/React) |
| 8 | Staff Software Engineer - Insurance | ashby (headway) | Next.js/AI | 3 | 0.40 | No | Borderline (Python/FastAPI but has Next.js/React) |
| 9 | Senior Sharepoint Developer | weworkremotely | Next.js/AI | 2 | 0.39 | No | **False positive** (SharePoint/.NET primary) |
| 10 | Senior Sharepoint Developer | weworkremotely | React/GraphQL | 2 | 0.39 | No | **False positive** (SharePoint/.NET primary) |
| 11 | Senior Fullstack Developer (React.js / Node.js) | weworkremotely | Next.js/AI | 2 | 0.45 | No | Strong (React/Node in title) |
| 12 | Senior MERN Developer (React.js + Node.js) | weworkremotely | Next.js/AI | 4 | 0.52 | No | Strong (MERN stack) |
| 13 | Senior MERN Developer (React.js + Node.js) | weworkremotely | React/GraphQL | 4 | 0.53 | No | Strong (MERN stack) |
| 14 | Senior Magento Developer | weworkremotely | PHP/Laravel | 2 | 0.42 | No | Borderline (Magento is PHP, but no Laravel/WordPress) |
| 15 | Senior Magento Developer | weworkremotely | React/GraphQL | 3 | 0.42 | No | **False positive** (Magento/PHP, wrong persona) |
| 16 | Senior Shopify Developer | weworkremotely | Next.js/AI | 4 | 0.40 | No | Strong (Shopify uses React/Next.js) |
| 17 | Senior Shopify Developer | weworkremotely | React/GraphQL | 4 | 0.44 | No | Strong (Shopify uses React/Next.js) |
| 18 | Partner Solution Architect (AWS) | ashby (supabase) | React/GraphQL | 2 | 0.41 | Yes | **False positive** (Architect role, not developer) |
| 19 | Partner Solution Architect (AWS) | ashby (supabase) | Next.js/AI | 2 | 0.42 | Yes | **False positive** (Architect role, not developer) |
| 20 | Senior React Developer | weworkremotely | Next.js/AI | 2 | 0.48 | Yes | Strong (React in title) |
| 21 | Senior React Developer | weworkremotely | React/GraphQL | 2 | 0.53 | Yes | Strong (React in title) |
| 22 | Senior AI Engineer | weworkremotely | Next.js/AI | 4 | 0.44 | Yes | **False positive** (Python/AI, bloated tag list) |
| 23 | Frontend Engineer | ashby (supabase) | React/GraphQL | 2 | 0.48 | Yes | Strong (Frontend, Supabase) |
| 24 | Frontend Engineer | ashby (supabase) | Next.js/AI | 2 | 0.49 | Yes | Strong (Frontend, Supabase) |
| 25 | Frontend Developer | ashby (gismart) | Next.js/AI | 2 | 0.47 | Yes | Strong (Frontend) |
| 26 | Frontend Developer | ashby (gismart) | React/GraphQL | 2 | 0.48 | Yes | Strong (Frontend) |
| 27 | AI Product Engineer - ClickStack | weworkremotely | Next.js/AI | 2 | 0.41 | Yes | **False positive** (Go/Rust/Kubernetes primary) |
| 28 | AI Product Engineer - ClickStack | weworkremotely | Next.js/AI | 2 | 0.41 | Yes | **False positive** (Go/Rust/Kubernetes primary, repost) |
| 29 | Senior Fullstack Engineer (f/m/d) - Berlin, EMEA | weworkremotely | Next.js/AI | 3 | 0.45 | Yes | **False positive** (false-global EMEA restriction) |
| 30 | Senior Fullstack Engineer (f/m/d) - Berlin, EMEA | weworkremotely | React/GraphQL | 3 | 0.45 | Yes | **False positive** (false-global EMEA restriction) |
| 31 | Senior Software Engineer (EAA) | weworkremotely | React/GraphQL | 2 | 0.37 | Yes | **False positive** (DevOps role) |
| 32 | Senior Software Engineer | weworkremotely | React/GraphQL | 2 | 0.43 | Yes | Borderline (React/TS/Go) |
| 33 | Senior Software Engineer | weworkremotely | Next.js/AI | 2 | 0.45 | Yes | Borderline (React/TS/Go) |
| 34 | Nuuly Senior Software Engineer | weworkremotely | Next.js/AI | 2 | 0.45 | Yes | **False positive** (Kotlin/Spring/JVM primary) |

**Summary:** 9 clear false positives, 5 borderline, 20 strong/acceptable. False-positive rate: **26% clear, 41% including borderline.**

---

## Appendix B: Key Code References

- **Gate 1+2 SQL router:** `src/lib/jobs/gate-1-2.ts` — lines 260–456 (full query), lines 354–356 (remote_scope filter), lines 357–359 (fence/natsec/qa filter), lines 385–393 (cross-source text_hash dedup)
- **Serve-time gate filter:** `src/lib/jobs/dashboard-queries.ts` — lines 59–64
- **Gate 3 system prompt:** `src/lib/jobs/gate-3.ts` — lines 131–181 (system prompt), line 136 (soft signal rule), line 137 (primary stack from title), line 153 (domain relevance)
- **Matching configuration:** `src/lib/jobs/matching-config.ts` — line 53 (GATE2_MAX_COSINE_DISTANCE = 0.55), line 72 (GATE2_RANK_ONLY = true), line 80 (GATE2_HARD_CEILING = 0.75), line 102 (GATE1_MIN_OVERLAP = 2)
- **Stack family definitions:** `src/lib/jobs/gate-1-2.ts` — lines 49–57
