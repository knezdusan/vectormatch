# Directive 30 Phase 2 — Integral Report: Precision Without Starvation

**Date:** 2026-08-17
**Status:** Phase 2 In Progress — Rulings 2.1–2.4 complete; Rulings 3–7 pending
**Preceded by:** [DIRECTIVE_30_INTEGRAL_REPORT.md](./DIRECTIVE_30_INTEGRAL_REPORT.md) (Phase 1, Aug 13 2026 — outage fix + subscription monitoring)
**Directive source:** [vectormatch_advisor_directive_30_precision_without_starvation.md](./vectormatch_advisor_directive_30_precision_without_starvation.md)
**Audit basis:** [MATCH_QUALITY_AUDIT_2026-08-17.md](../audits/MATCH_QUALITY_AUDIT_2026-08-17.md)
**Tests:** 2945/2945 pass (129 files, +55 new tests)
**Build:** Clean (tsc --noEmit, Biome, Vitest all green)

---

## Executive Summary

D30 Phase 1 (Aug 13) resolved a 5-day production outage caused by OpenAI credit exhaustion and added subscription health monitoring. D30 Phase 2 responds to the match-quality audit (81 rows, 26% clear false-positive rate) and the advisor directive "Precision Without Starvation," which rejected the audit's headline recommendation to tighten `GATE2_HARD_CEILING` to 0.55 and instead prescribed deterministic precision blockers, geo-classification expansion, Gate 3 prompt reform, tag-semantics separation, embedding symmetry repair, remote-native source expansion, dashboard grouping, and housekeeping.

This report covers the implementation of **Rulings 2.1–2.4** (the deterministic precision layer), which the directive placed first in execution order as the biggest precision gain at zero yield cost. The remaining rulings (3a, 3b, 4, 5, 6, 7) and the audit re-run are pending.

**Key changes in this phase:**

| Ruling | Change | New tests | Files touched |
|--------|--------|-----------|---------------|
| 2.1 | Platform-name deterministic blocker (pre-LLM, persona-relative) | 48 | `title-blockers.ts` (new), `pipeline.ts`, `title-blockers.test.ts` (new) |
| 2.2 | Role-family deterministic blocker (Architect, DevOps, Mobile, QA, etc.) | (same module) | (same) |
| 2.3 | Geo title/region check — Costa Rica + 40 countries + ANZ/MENA/Americas regions | 7 | `gate-zero.ts`, `gate-1-2.ts`, `remote-scope-patterns.ts`, `gate-zero.test.ts` |
| 2.4 | Gate 3 prompt — "missing tags are soft signal" → ≥2 must-have in PRIMARY stack hard blocker | 0 (prompt change) | `gate-3.ts` |

---

## Context: The Audit and the Directive's Counter-Argument

The match-quality audit (Aug 17, 2026) analyzed 81 match rows across the three personas and classified 9 of 34 dashboard-visible approved matches (26%) as clear false positives. The audit's Priority 1 recommendation was to tighten `GATE2_HARD_CEILING` from 0.75 to 0.55.

The advisor directive rejected this as the primary lever, citing the audit's own evidence:

| Match | Quality (audit annotation) | Cosine similarity |
|-------|---------------------------|-------------------|
| Vercel — Member of Technical Staff | **Strong** | 0.39 |
| Senior SharePoint Developer | **False positive** | 0.39 |
| SimSpace Fullstack (Kotlin + Costa Rica) | **False positive** | 0.42 |
| Senior Magento Developer (PHP persona) | Borderline-legit | 0.42 |

Good and bad matches share the same similarity scores. Simulating the 0.55 ceiling: kills the Vercel match and both Shopify matches (three strongest), keeps the Berlin/EMEA false-global and the Kotlin/Spring false positive, and drops yield 34 → 14 (−59%).

**The directive's position:** precision must come from deterministic blockers that catch wrong-stack and wrong-geo jobs at zero yield cost, not from a threshold on a signal that cannot distinguish Vercel from SharePoint. The ceiling stays at 0.75 until the embedding representation is fixed (Ruling 3b, pending).

---

## RULING 2.1 — Platform-Name Deterministic Blocker

### Problem

The audit identified jobs like "Senior SharePoint Developer," "Senior Magento Developer," and .NET/C# roles reaching the dashboard for JS/React personas. These jobs have generic tag overlap (TypeScript, JavaScript) that passes Gate 1, and Gate 3's permissive "missing tags are a soft signal" rule approved them.

### Implementation

**New module:** `src/lib/jobs/title-blockers.ts`

A pre-LLM, persona-relative deterministic filter that runs after Gate 1+2 inserts candidates into `match_queue` but before Gate 3 fan-out. If the job title names a platform/CMS/e-commerce system NOT in the persona's must-have tags, the candidate is rejected with a deterministic blocker reason.

**Platforms blocked (18 total):**

| Category | Platforms |
|----------|-----------|
| CMS | SharePoint, Drupal, WordPress, Webflow, Contentful, Storyblok |
| E-commerce | Shopify, Magento, BigCommerce, WooCommerce |
| CRM/Enterprise | Salesforce, ServiceNow, Dynamics 365 |
| DXP/Enterprise CMS | Sitecore, AEM, Episerver/Optimizely |
| Stack platform | .NET/C#, SAP, Oracle |

**Persona-relative exceptions:**
- WordPress is allowed for the PHP/Laravel persona (`wordpress` in must-have tags).
- Shopify is allowed for personas with `shopify` in must-have tags.
- .NET/C# is allowed for personas with any .NET-family tag (`csharp`, `dotnet`, `aspnet`, `blazor`, `fsharp`, `razor`).
- All exceptions are checked against the persona's actual `must_have_tags` — no hardcoded persona assumptions.

**Wiring:** Integrated into `gateRouteAndFanOut` in `src/scheduler/pipeline.ts`. After Gate 1+2 returns candidates, the pipeline:
1. Fetches the job title and each candidate persona's `must_have_tags` + `seniority_levels`.
2. Calls `filterCandidatesByTitleBlockers(title, candidatesWithTags)`.
3. Marks rejected candidates in `match_queue` as `rejected` with `llm_model = 'title-blocker-deterministic'`, `llm_blockers = [blocker reason]`, `llm_confidence = 1.0`.
4. Only candidates that pass proceed to Gate 3 fan-out.

This preserves the audit trail (the `match_queue` row shows the deterministic rejection reason) and re-evaluability (future persona changes can re-trigger matching).

### Test coverage

48 unit tests in `src/lib/jobs/__tests__/title-blockers.test.ts`:
- Platform blocking for JS persona (SharePoint, Magento, Salesforce, ServiceNow, Sitecore, AEM, Webflow, .NET, C#, Drupal).
- Persona-relative exceptions (WordPress for PHP persona, Shopify for Shopify persona, .NET for dotnet persona).
- Generic title passthrough ("Senior Software Engineer", "Full Stack Developer").
- Edge cases (empty title, null title).

---

## RULING 2.2 — Role-Family Deterministic Blocker

### Problem

The audit identified roles like "Senior Mobile Engineer (React Native)," "Senior Sharepoint Developer," DevOps/SRE roles, and architect roles reaching the dashboard for web-development personas. Gate 0 (the pre-ingestion title filter) is intentionally broad (recall-optimized) and lets these through; Gate 3's "balanced" output rule approved them.

### Implementation

Same module (`title-blockers.ts`), checked after the platform-name blocker. If the title indicates an unsuitable role family for a web-development persona, the candidate is rejected.

**Role families blocked (8 total):**

| Family | Title patterns | Exempt tags | Exempt by seniority |
|--------|---------------|-------------|---------------------|
| Architect | Solutions/Software/Systems/Cloud/Data/Enterprise/Technical Architect | — (always blocked for IC) | — |
| DevOps/SRE/Platform | DevOps, SRE, Site Reliability, Platform/Infrastructure/Release/Build Engineer | docker, kubernetes, terraform, ansible, aws, gcp, azure | — |
| Data Engineer | Data Engineer, Data Infrastructure, ETL Engineer, Data Pipeline | python, sql, airflow, dbt, spark | — |
| ML Engineer | ML/Machine Learning/AI/Deep Learning/NLP/Computer Vision/Research Engineer | python, ml, prompt-engineering, langchain, pytorch, tensorflow | — |
| Mobile | Mobile/iOS/Android Developer, React Native, Flutter, Swift/Kotlin Developer | react-native, swift, kotlin, flutter, mobile | — |
| QA/SDET | QA Engineer/Lead/Automation, Quality Assurance/Engineer, SDET, Test Automation Engineer | qa, sdet, testing, test-automation, playwright, cypress, selenium | — |
| Engineering Manager | Engineering Manager/Director, Head/VP of Engineering, Tech/Team Lead, Lead Developer | — | manager, lead, staff, principal |
| Security Engineer | Security Engineer, AppSec, DevSecOps, Penetration Tester | security, appsec, devsecops | — |

**Persona-relative exemptions:**
- The AI persona (`prompt-engineering` in must-have tags) is exempted from the ML Engineer blocker.
- Personas with DevOps tags (`docker`, `kubernetes`, etc.) are exempted from the DevOps blocker.
- Personas with `manager`/`lead`/`staff`/`principal` seniority are exempted from the management blocker.
- No current persona has QA or mobile tags, so those blockers fire for all three personas.

### Test coverage

Covered in the same 48-test file:
- Role-family blocking for JS/frontend personas (Architect, DevOps, SRE, Platform, Data Engineer, ML Engineer, Mobile, iOS, React Native, QA, SDET, Engineering Manager, Tech Lead).
- Persona-relative exemptions (DevOps with docker tag, ML with prompt-engineering tag, React Native with react-native tag, Engineering Manager with manager seniority, QA with qa tag).
- Platform blocker takes precedence over role-family when both match.

---

## RULING 2.3 — Geo Title/Region Check

### Problem

The audit found "Remote - Costa Rica" and Berlin/EMEA jobs classified as `global` and reaching the dashboard. The existing `detectCountryFence` function in `gate-zero.ts` scanned `location_name` but its country list was incomplete (missing Costa Rica and ~40 other countries), and the "Remote - {Country}" title pattern only covered ~30 countries. The SQL fallback in `gate-1-2.ts` had the same gap.

### Implementation

**`src/lib/jobs/gate-zero.ts` — `COUNTRY_NAMES` expanded:**
Added 40+ countries: Costa Rica, Chile, Peru, Uruguay, Ecuador, Panama, Guatemala, Dominican Republic, Puerto Rico, Holland, Iceland, Czechia, Bulgaria, Hungary, Slovakia, Slovenia, Croatia, Serbia, Estonia, Latvia, Lithuania, Luxembourg, Monaco, Malta, Cyprus, Bangladesh, Sri Lanka, Nepal, Thailand, Taiwan, China, Ghana, Dubai, Qatar, Bahrain, Kuwait, Oman, Jordan, Lebanon.

**`src/lib/jobs/gate-zero.ts` — `FENCE_PATTERNS` regex expanded:**
The "Remote - {Country}" / "Remote; {Country}" / "Remote, {Country}" pattern now matches the full expanded country list (was ~30 countries, now ~70).

**`src/lib/jobs/gate-zero.ts` — `REGION_TERMS` expanded:**
Added: Americas, MENA, GCC, ANZ, Australasia, Oceania (was missing; only had EMEA, APAC, LATAM, NAMER, etc.).

**`src/lib/jobs/gate-1-2.ts` — SQL fallback regex expanded:**
Three inline regex patterns in the `job_meta` CTE COALESCE fallback (for NULL `is_fenced` rows) updated to match the expanded country and region lists. This ensures jobs ingested before the fence gate was added are still caught at match time.

**`src/lib/jobs/remote-scope-patterns.ts` — `COUNTRY_CODE_MAP` expanded:**
Added: Costa Rica (CR), Chile (CL), Uruguay (UY), Ecuador (EC), Panama (PA), Guatemala (GT), Luxembourg (LU), Malta (MT), Cyprus (CY).

**`src/lib/jobs/remote-scope-patterns.ts` — `COUNTRY_FENCED_HIGH` expanded:**
Added `countryFencedPatterns` calls for Costa Rica, Chile, Argentina, Mexico, Colombia — generating "X only", "must be based in X", "right to work in X", "authorized to work in X" high-confidence patterns for each.

### Test coverage

7 new tests in `src/lib/jobs/__tests__/gate-zero.test.ts`:
- "Remote - Costa Rica" in title → `title_fence`
- "Remote - Costa Rica" in location → `location_country`
- "Remote - Chile" in title → `title_fence`
- "ANZ" in location → `location_region`
- "Americas" in location → `location_region`
- "MENA" in location → `location_region`
- "Remote - Lithuania" in title → `title_fence`

All 193 gate-zero tests pass (186 existing + 7 new).

---

## RULING 2.4 — Gate 3 Prompt: Primary Stack Overlap Hard Blocker

### Problem

The Gate 3 system prompt criterion 1 stated: "Missing tags are a soft signal, not a hard blocker; the description is the source of truth." This permissive rule allowed wrong-stack jobs through — a Kotlin/Spring job with a React frontend would be approved for a React persona because "React" appears in the description, even though the primary stack is Kotlin/Spring.

### Implementation

**`src/lib/jobs/gate-3.ts` — criterion 1 rewritten:**

Replaced "Missing tags are a soft signal, not a hard blocker" with:

> **PRIMARY STACK OVERLAP (HARD BLOCKER — Directive 30 Ruling 2.4):** Determine the job's PRIMARY stack from the title plus the majority of required technologies mentioned in the job description. Count how many of the persona's must-have tags appear in this primary stack. If fewer than TWO must-have tags are present in the primary stack, this is a HARD BLOCKER — reject immediately.

The new rule includes a concrete example: a "Fullstack Developer" job requiring Kotlin + Spring backend with some React frontend has a primary stack of {kotlin, spring, java} — if the persona's must-have tags are {typescript, nextjs, react, nodejs, prompt-engineering}, only "react" is in the primary stack (1 < 2) → HARD BLOCKER.

The existing "PRIMARY STACK FROM TITLE" hard blocker (title names a specific technology not in persona tags) is preserved as a complementary rule.

**`src/lib/jobs/gate-3.ts` — OUTPUT RULES updated:**

Added "PRIMARY STACK OVERLAP below 2 must-have tags (Directive 30 Ruling 2.4)" to the explicit list of HARD blockers in the output rules section.

### Test coverage

No new tests (prompt text change). All 79 existing Gate 3 tests pass — no test asserted on the old "soft signal" language.

---

## Architecture: Where the Blockers Sit in the Pipeline

```
Job ingested
  → Gate 0 (title filter — recall-optimized, pre-DB)
  → Gate 0 Fence (detectCountryFence — now with Costa Rica + 40 countries)
  → Normalize (extract tags, description, remote scope)
  → Embed (if not fenced/probation)
  → Gate 0.5 (hard blocker pre-filter — compliance, comp, experience)
  → Gate 1+2 (SQL router — GIN overlap + HNSW vector, inserts candidates into match_queue)
  → ★ NEW: Title Blockers (Rulings 2.1 + 2.2) — pre-LLM, persona-relative
      → Platform-name check (SharePoint, Magento, .NET, etc.)
      → Role-family check (Architect, DevOps, Mobile, QA, etc.)
      → Rejected candidates marked in match_queue with deterministic reason
  → Gate 3 (LLM arbiter — now with PRIMARY STACK OVERLAP hard blocker, Ruling 2.4)
  → Dashboard (serve-time filter: global + not fenced + not natsec + not QA)
```

The title blockers are **additive** — they don't replace Gate 0, Gate 0.5, or Gate 3. They catch what those gates miss: persona-relative platform and role-family mismatches that pass Gate 1 (generic tag overlap) and would be approved by Gate 3 (permissive missing-tag rule, now tightened).

---

## Files Changed

### New files
| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/jobs/title-blockers.ts` | Deterministic title blocker module (platform-name + role-family) | 295 |
| `src/lib/jobs/__tests__/title-blockers.test.ts` | Unit tests for title blockers | 376 |

### Modified files
| File | Change |
|------|--------|
| `src/scheduler/pipeline.ts` | Wired title blockers into `gateRouteAndFanOut` between Gate 1+2 and Gate 3 fan-out |
| `src/lib/jobs/gate-zero.ts` | Expanded `COUNTRY_NAMES` (+40 countries), `REGION_TERMS` (+6 regions), `FENCE_PATTERNS` regex |
| `src/lib/jobs/gate-1-2.ts` | Expanded SQL fallback regex (3 patterns) with full country/region list |
| `src/lib/jobs/remote-scope-patterns.ts` | Expanded `COUNTRY_CODE_MAP` (+8 countries), `COUNTRY_FENCED_HIGH` (+5 country pattern families) |
| `src/lib/jobs/gate-3.ts` | Rewrote criterion 1 (primary stack overlap hard blocker) + output rules |
| `src/lib/jobs/__tests__/gate-zero.test.ts` | +7 tests for Costa Rica/ANZ/Americas/MENA/Lithuania geo-fence detection |

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Clean (0 errors) |
| `biome check` | Clean (1 pre-existing warning: unused `runGate1Only` — not from this phase) |
| `vitest run` (full suite) | 2945/2945 pass (129 files, +55 new tests) |
| `vitest run title-blockers` | 48/48 pass |
| `vitest run gate-zero` | 193/193 pass (186 existing + 7 new) |
| `vitest run gate-3` | 79/79 pass |
| `vitest run remote-scope-patterns` | 95/95 pass |
| `vitest run remote-scope-extractor` | 73/73 pass |

---

## Pending Work (Rulings 3–7 + Audit Re-Run)

The following rulings from the directive are not yet implemented:

| Ruling | Description | Status |
|--------|-------------|--------|
| 3a | Required-vs-mentioned tag separation + distinctive-tag rule | Pending |
| 3b | Embedding symmetry fix — role-summary per job, summary-to-summary embedding | Pending |
| 4 | Remote-native board expansion (Remotive, RemoteOK, Himalayas, Wellfound, STP probes) | Pending |
| 5 | Gate 3 geo diagnosis (sample 5 ghosts, print prompt) + purge ghost approvals | Pending |
| 6 | Dashboard multi-persona grouping + same-source repost dedup | Pending |
| 7 | Backfill 44 NULL fence flags + PHP/Laravel inflow reporting | Pending |
| — | Re-run audit after Rulings 2–4, compare false-positive rate + yield | Pending |

**Ruling 1 (do NOT tighten GATE2_HARD_CEILING):** Honored. The ceiling remains at 0.75. No changes were made to `matching-config.ts`. The directive specifies revisiting the ceiling only after Ruling 3b (embedding symmetry fix) is complete.

---

## Governing Document Updates

- `docs/governing/vectormatch-blueprint.md` — Updated with D30 Phase 2 changes (title blockers, geo expansion, Gate 3 prompt reform)
- `docs/governing/VectorMatchTechicalImplementation.md` — Updated with D30 Phase 2 technical details (new module, pipeline wiring, expanded patterns)
- `docs/reports/directives/DIRECTIVE_30_PHASE2_INTEGRAL_REPORT.md` — This document
