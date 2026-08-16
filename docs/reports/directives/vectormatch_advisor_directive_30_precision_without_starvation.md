# VectorMatch — Directive 30: Precision Without Starvation

*Devin's match-quality audit is the campaign's best analytical work — 81 rows, per-match classification, honest false-positive count (26% clear, 41% with borderline). But three things in his own data point away from his headline recommendation. Priority 1 (tighten GATE2_HARD_CEILING to 0.55) would delete the three best matches in the dataset, keep three of the worst, and cut yield 59% while the founder is starving. The precision problem is real; the threshold is the wrong lever. And buried in the source table is the strategic validation of the entire D26 pivot.*

---

## RULING 1 — DO NOT tighten GATE2_HARD_CEILING (Devin's Priority 1: REJECTED as primary lever)

**The evidence, from Appendix A:** the embedding has almost no discriminative power in the operative band.

| Match | Quality (Devin's own annotation) | Sim |
|---|---|---|
| Vercel — Member of Technical Staff | **Strong** | 0.39 |
| Senior SharePoint Developer | **False positive** | 0.39 |
| SimSpace Fullstack (Kotlin + Costa Rica) | **False positive** | 0.42 |
| Senior Magento Developer (PHP persona) | Borderline-legit | 0.42 |

Good and bad share the same scores. Simulating the 0.55-distance ceiling over the 34 dashboard rows: **kills** the Vercel match and both Shopify matches (three of the strongest), **keeps** the Berlin/EMEA false-global pair and the Kotlin/Spring FP, and drops yield 34 → 14.

**Ceiling stays at 0.75 until the representation is fixed (Ruling 3). Revisit with data afterward — and if tightened then, to ~0.65, not 0.55.**

## RULING 2 — Precision comes from DETERMINISTIC blockers (Devin's Priority 2: ADOPTED and extended)

These achieve the precision goal at near-zero yield cost — they would catch 13–15 of the 15 false positives while losing zero strong matches.

1. **Platform-name blocker** (pre-LLM, deterministic): SharePoint, Magento, Shopify, Drupal, Salesforce, ServiceNow, Sitecore, AEM, Webflow, .NET/C#. If the TITLE names a platform absent from the persona's must-haves → reject. (Note: Shopify/WordPress are legitimate for the PHP and React personas respectively — the rule is persona-relative, not global.)
2. **Role-family blocker**: Architect, Solutions Architect, DevOps, SRE, Platform Engineer, Data Engineer, ML Engineer, Mobile/iOS/Android/React Native, QA/SDET, Engineering Manager. Reject for web-dev personas lacking those must-haves.
3. **Geo title/region check** (fixes the two dashboard false-globals): scan TITLE and location for `Remote - {Country}`, region tokens (EMEA, APAC, LATAM, ANZ), and any country name — currently only `location_name` is scanned. Add Costa Rica and the full country list. Deterministic, at ingestion, sets `is_fenced`.
4. **Gate 3 prompt**: change "missing tags are a soft signal" → *if the job's PRIMARY stack (title + majority of required tags) does not include ≥2 of the persona's must-have tags, this is a HARD blocker.*

## RULING 3 — Fix the tag semantics and the embedding representation (the two root causes nobody has fixed)

**3a. Overlap counts MENTIONED technologies, not REQUIRED ones — this is the false-positive engine.**
56 of 81 matches sit at the overlap-2 minimum, and `typescript`/`javascript` appear in nearly every modern JD. A Go/Rust/Kubernetes role that says "we also use TypeScript for internal tooling" earns overlap-2 against every JS persona.
- Extract **required stack** separately from **mentioned technologies** (requirements section vs prose).
- Require **≥1 DISTINCTIVE tag** (nextjs, laravel, graphql, wordpress, tailwindcss, prompt-engineering) rather than raising the blunt count. **This replaces Devin's Priority 7** (overlap≥3 would cut good and bad alike).

**3b. Fix the embedding granularity mismatch — diagnosed in D18 (Break 4), never fixed.**
Persona = 3-sentence summary; job = full description (thousands of chars). This is why **zero matches in the entire corpus exceed 0.53 similarity** and why the distribution is flat.
- Generate a normalized **role-summary per job** (mirror of the persona summary), embed summary-to-summary, re-embed the corpus in one batch.
- Report the new perfect-vs-garbage spread. Target: strong matches < 0.35 distance. Only after this does any threshold tuning become meaningful.

## RULING 4 — The source table is the strategic headline: DOUBLE DOWN on remote-native

| Source | Matches | Approved |
|---|---|---|
| **weworkremotely** | 41 | **34** |
| ashby | 30 | 12 |
| greenhouse | 4 | **0** |
| lever | 1 | **0** |
| remoteok_direct | 3 | 2 |
| larajobs | 1 | 1 |

**One remote-native board produced 69% of all approved matches. The entire ATS layer produced zero from Greenhouse and Lever.** This is the D26 inversion validated in production data — and it has been applied to exactly one board.

**Execute now (4th request):** Remotive, RemoteOK (expand), **Himalayas `worldwide=true`**, Wellfound via FlareSolverr, plus STP probes of Jobicy / Working Nomads / Remote.co. Redirect all polling budget from Greenhouse/Lever/SmartRecruiters/Workable to these. Report per-source: jobs/day, fence rate, approved matches.

## RULING 5 — Gate 3's geo failure is an alarm, not a billing note

Devin frames the 15 "ghost approvals" as wasted OpenAI calls. Sharper reading: **Gate 3 approved 14 of 18 country-fenced jobs — a 78% geo-detection failure rate.** Only the D21 serve-time filter stands between those and the founder's dashboard.
1. Sample 5 ghost approvals; print the exact Gate 3 prompt and the geo criterion as the model receives it. Is criterion 11 present in the deployed prompt? Are these pre-criterion-11 rows?
2. Deterministic fencing (Ruling 2.3) must catch these BEFORE the LLM — the LLM is the backstop, not the primary geo gate.
3. **Purge the ghost approvals** (Devin's Priority 4): approved + non-global → rejected. Approved, with the note that the rows stay re-evaluable.

## RULING 6 — Dashboard: group multi-persona matches (part of the founder's "duplicates")

30 multi-persona rows mean the same job renders 2–3 times on one page. Per-persona correctness doesn't matter to the reader — it reads as duplication. **Group by job; show matched personas as badges on one card.** Also add same-source repost dedup (Devin's Priority 5: adopted) keyed on `(ats_source, ats_slug, normalized_title)`.

## RULING 7 — Housekeeping (Devin's Priorities 4/6: adopted)

- **Backfill the 44 NULL fence flags** with the CURRENT pattern set (post-Ruling-2.3), then keep the COALESCE fallback for new rows.
- PHP/Laravel persona famine confirmed (1 larajobs + 1 Magento match total) — larajobs polling + WP-ecosystem boards are its only channels; report its inflow separately so the thin stack stays visible.

## Execution order

1. Ruling 2 (deterministic blockers + geo title check) — biggest precision gain, no yield cost.
2. Ruling 4 (remote-native expansion) — biggest supply gain, validated by data.
3. Ruling 3a (required-vs-mentioned tags + distinctive-tag rule).
4. Ruling 3b (embedding symmetry re-embed).
5. Rulings 5, 6, 7.
6. Re-run this audit after 1–4 and compare false-positive rate + yield.

## What to bring back

1. False-positive rate on dashboard-visible matches, before → after Rulings 2 + 3a (target: 26% → <10% with yield ≥ 30).
2. Per-source table after the remote-native expansion: jobs/day, fence rate, approved matches.
3. Embedding spread before → after symmetry fix (target: strong matches < 0.35 distance).
4. Gate 3 geo diagnosis: the deployed prompt text + whether criterion 11 is live + ghost purge executed.
5. Dashboard grouping live; NULL flags backfilled; PHP inflow reported separately.

*Re-anchor: the audit proves the machine now runs and that its output is 26% wrong — but the fix is not to cut a threshold on a signal that cannot tell Vercel from SharePoint. It is to block the wrong roles deterministically, to stop counting a passing mention of TypeScript as a match, to finally give the embeddings something symmetrical to compare, and to pour supply in from the one class of source that has already produced 69% of everything good this system has ever delivered.*
