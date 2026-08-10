# Engineering Notes — Category-Specific Rules

> **These rules override the standard BlogPostGenerationPrompt rules for posts in the "Engineering Notes" category.**
>
> The standard content pipeline serves VectorMatch's discovery (SEO, AEO, machine citation).
> Engineering Notes serves the **author's credibility** with hiring managers and technical recruiters.
> They are different audiences with different success metrics and different failure modes.

## The Problem These Rules Solve

The standard pipeline produces AEO-shaped content: "What you'll learn" bullets, 5-question FAQ
blocks, 3+ mid-article product CTAs, on-page TOC scaffolding. That shape is good for Google
citation but reads as AI-generated to a DevRel or docs reviewer. The technical substance underneath
gets discounted because the scaffolding screams "content marketing."

Engineering Notes posts must read like a **solo developer's debugging story** — first-person,
opinionated, no marketing scaffolding. A hiring manager should be able to read one and credit the
debugging to a specific person, not a corporate "we."

## Rule 1: First Person Singular

- Write as **"I"**, not "we" or "the team."
- "I deployed." "My mental model was wrong." "I moved the counter to Redis."
- The author is a **named individual** (Dusan Knezevic), not "VectorMatch Engineering Team."
- The author_box byline must be the author's name, and the html should be a 2-3 sentence
  personal bio, not a corporate description.
- No corporate "we" anywhere — not in the hero, not in the body, not in the conclusion, not in
  the author box.

## Rule 2: No AEO Scaffolding

The following elements from the standard pipeline are **removed or reduced** for Engineering Notes:

| Element | Standard Pipeline | Engineering Notes |
|---|---|---|
| `key_takeaways` ("What you'll learn") | 3-5 bullets | **Empty array `[]`** — do not include |
| Mid-article CTAs | 2-3 (`hero`, `mid`, `howto`) | **Zero** — no CTAs in the body |
| Closing CTA | 1 | **1 only** — at the very end, in the conclusion |
| FAQ | 3-5 questions | **0-2 questions max** — only if they add technical depth, not SEO |
| `hero.direct_answer` | 50-75 word AEO snippet | **Keep** but rewrite in first person |
| `hero.subtitle` | Promise + who it's for | **Keep** but make it a one-line story hook, not a marketing pitch |
| On-page TOC | Implicit via H2 structure | **No TOC** — H2s are narrative beats, not a table of contents |

## Rule 3: One CTA, Closing Only

- `cta_blocks` contains **exactly one** entry with `id: "closing"`.
- No `[[CTA:hero]]`, `[[CTA:mid]]`, or `[[CTA:howto]]` markers in `content_html`.
- The closing CTA copy should be **low-key and contextual**, not a hard sell.
  - Good: "I build VectorMatch — it matches developers to roles by semantic fit. →"
  - Bad: "I want VectorMatch to handle the infrastructure so I can focus on shipping →"
- The CTA links to https://vectormatch.dev but reads like a personal sign-off, not a product pitch.

## Rule 4: Narrative Shape, Not List Shape

- The post follows the classic engineering war story arc: **bug → wrong mental model → fix →
  generalisable lesson**.
- H2 headings are narrative beats, not SEO-optimised questions.
  - Good: "The Bug: 2 req/s in Tests, 12 req/s in Production"
  - Bad: "Why Rate Limiting Matters in 2026"
- Code blocks are encouraged — they prove the author actually wrote the code.
- Blockquotes are for the author's own realisations, not for sourced quotes from others.
- The tone is **honest and slightly self-deprecating** — the author is admitting a mistake, not
  positioning as an expert.

## Rule 5: Images — Diagrams Over Stock Photos

- Prefer **technical diagrams** (architecture, flowcharts, before/after comparisons) over stock
  photos of developers at laptops.
- The hero image can be a diagram or a relevant code/terminal screenshot.
- Image generation prompts should specify the VectorMatch brand colors but prioritise clarity
  over aesthetics — this is engineering documentation, not marketing.

## Rule 6: Tags

Engineering Notes posts use engineering-specific tags from the approved list:
- `Inngest`, `Redis`, `Rate Limiting`, `PostgreSQL`, `Production`
- Plus any relevant standard tags (e.g., `Node.js`, `TypeScript`, `AI`) when applicable.

## Rule 7: Author Box

```json
"author_box": {
  "byline": "Dušan Knežević",
  "html": "<p>Personal bio written in first person. 2-3 sentences. What I build, what I've shipped, what I'm working on. Links to <a href=\"https://vectormatch.dev/blog/dusan-knezevic/\">the author page</a>.</p>"
}
```

The author name must use proper diacritics: **Dušan Knežević** (not "Dusan Knezevic").

The author box byline links to the author page at `/blog/dusan-knezevic/`, not to `vectormatch.dev`.

Each Engineering Notes post must include an author `@id` reference in JSON-LD:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "author": {
    "@id": "https://vectormatch.dev/blog/dusan-knezevic/#person"
  }
}
```
This resolves to the Person schema on the author page.

## Summary: What Changes in the JSON

```jsonc
{
  "meta": { ... },              // same structure, category = "Engineering Notes"
  "hero": { ... },              // first person, story hook
  "key_takeaways": [],          // ALWAYS empty for Engineering Notes
  "content_html": "...",        // first person, NO [[CTA:...]] markers, [[IMAGE:...]] OK
  "cta_blocks": [               // EXACTLY ONE entry
    {
      "id": "closing",
      "copy": "low-key personal sign-off →",
      "url": "https://vectormatch.dev",
      "buyer_drive": "gain",
      "placement_note": "Closing only — no mid-article CTAs"
    }
  ],
  "images": [ ... ],            // diagrams preferred over stock photos
  "faq": [],                    // empty or max 2 — only if technically valuable
  "conclusion": {
    "summary_html": "...",      // first person, no corporate "we"
    "closing_cta_id": "closing"
  },
  "author_box": {
    "byline": "Dusan Knezevic",
    "html": "personal bio in first person"
  },
  "research_appendix": { ... }  // same structure, but sources are engineering docs/ repos
}
