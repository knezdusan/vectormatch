# VectorMatch Blog Post Generation — External LLM Prompt Template

This document contains the **exact prompt** to paste into a fresh session of any flagship LLM (Grok, Gemini, Claude, Kimi, GPT, etc.) to generate one publish-ready VectorMatch blog post per session, plus the rationale and the machine-readable output contract your orchestrator will parse and push to WordPress via the WPVibe MCP server.

---

## 1. How to Use This

**Per session, per topic:**
1. Open a new session with one flagship LLM.
2. (Optional but recommended) Attach these two files for deeper context:
   - `docs/wordpress/WordpressBlogPostTemplate.md` (full structure spec)
   - `docs/wordpress/wordpress-blog-research-brief.md` (audience, tone, taxonomy)
   The prompt below is **self-contained** and works even if you cannot attach files.
3. Paste the full prompt from Section 4.
4. Replace the three placeholders:
   - `{{TOPIC}}` — the exact post title/topic from `WordpresBlogPostsPerCategory.md`.
   - `{{CATEGORY}}` — the one category that topic belongs to.
   - `{{ANGLE_NOTES}}` — (optional) any extra angle, data point, or constraint you want.
5. The model returns a single JSON object matching the schema in Section 3.
6. Save the JSON. The orchestrator parses it, renders CTAs/images at the markers, builds schema, and publishes via WPVibe.

---

## 2. Design Decisions (Why This Format)

- **Format = JSON.** Most reliable structured output across all flagship models; trivial for the orchestrator to parse and validate.
- **Body = clean semantic HTML string** (`content_html`) with **insertion markers** (`[[CTA:...]]`, `[[IMAGE:...]]`). The LLM never reasons about Gutenberg vs. Elementor; the orchestrator injects branded components at the markers.
- **Metadata is separated** (title, meta, slug, category, tags, FAQ, schema, keywords) so Rank Math + WPVibe get exactly what they need.
- **Images = specifications, not required URLs.** LLMs hallucinate image URLs unreliably. Every image must have alt/caption/description/generation-prompt. Browsing-capable models MAY add candidate URLs flagged `unverified`.
- **Research appendix included** as a separate top-level object (`research_appendix`) — improves grounding and uniqueness, and is stripped before publishing.

---

## 3. Output Contract (JSON Schema)

The model must return **only** a single valid JSON object with this exact top-level shape:

```jsonc
{
  "meta": {
    "topic": "string — the topic given to the model",
    "category": "string — one of the 6 approved categories",
    "tags": ["2–5 strings from the approved tag list"],
    "title": "string — H1 / display title",
    "seo_title": "string — 55–60 chars, primary keyword first",
    "meta_description": "string — 135–160 chars, benefit-driven, includes primary keyword",
    "slug": "string — short, hyphenated, keyword-first",
    "primary_keyword": "string",
    "secondary_keywords": ["3–5 strings"],
    "schema_types": ["Article", "FAQPage", "HowTo"],  // include those that apply; Article always
    "estimated_word_count": 0,
    "reading_time_minutes": 0
  },

  "hero": {
    "subtitle": "string — 1 sentence, 15–25 words, the promise + who it's for",
    "direct_answer": "string — 50–75 words answering the core query, standalone for AI Overviews"
  },

  "key_takeaways": ["3–5 benefit-first bullet strings"],

  "content_html": "string — full article body as clean semantic HTML. See rules below.",

  "cta_blocks": [
    {
      "id": "hero",                     // must match a [[CTA:hero]] marker in content_html
      "copy": "string — first-person, benefit-driven, ends with →",
      "url": "https://vectormatch.dev",
      "buyer_drive": "save|gain|reduce|increase|improve",
      "placement_note": "string — where/why this CTA sits"
    }
  ],

  "images": [
    {
      "id": "hero",                     // EXACTLY ONE image must have id "hero" and role "hero" — the hero/OG image
      "role": "hero",                   // MUST be exactly "hero" | "inline" | "diagram" — no other values allowed
      "alt_text": "string — descriptive, SEO-aware",
      "caption": "string — optional visible caption",
      "description": "string — what the image should depict",
      "generation_prompt": "string — a prompt to generate this image (brand colors: #7c3aed, #8b5cf6, #a855f7, #34d399, dark bg #16161e)",
      "suggested_search_query": "string — query to find a stock image if generating isn't used",
      "candidate_url": "string|null — optional real URL if the model can browse; else null",
      "url_verified": false             // must be false unless the model actually confirmed the URL resolves
    }
  ],

  "faq": [
    { "question": "string — phrased as a developer would search it", "answer": "string — 40–80 words, self-contained" }
  ],

  "conclusion": {
    "summary_html": "string — 2–3 short paragraphs as HTML, restates insight + next step",
    "closing_cta_id": "closing"         // references a cta_blocks entry with id 'closing'
  },

  "author_box": {
    "byline": "VectorMatch Team",
    "html": "string — 2–3 sentence authority box as HTML, links to https://vectormatch.dev"
  },

  "research_appendix": {
    "communities_consulted": ["subreddits, HN threads, Discord/forum names, etc."],
    "social_sources": ["specific X accounts/threads, LinkedIn posts, YouTube videos referenced"],
    "key_insights": ["3–8 real pain points / unique findings discovered during research"],
    "notable_quotes": [
      { "quote": "string", "source": "string — where it came from", "url": "string|null" }
    ],
    "sources": [
      { "title": "string", "publisher": "string", "url": "string", "used_for": "string" }
    ],
    "uniqueness_statement": "string — 1–2 sentences on what this post adds that isn't already on the web"
  }
}
```

### `content_html` rules
- Semantic HTML only: `<h2>`, `<h3>`, `<p>`, `<ul>`/`<ol>`/`<li>`, `<table>`, `<blockquote>`, `<pre><code>`, `<a href>`, `<strong>`, `<em>`.
- **Do NOT include** the H1 (that's `meta.title`), the hero subtitle/direct answer (those are in `hero`), the key takeaways, the FAQ, the conclusion, or the author box — those are rendered from their own fields.
- **Start** the body with the "Why this matters in 2026" context section as the first `<h2>`.
- 3–5 `<h2>` sections. Each `<h2>` must be immediately followed by a `<p>` that is a **40–60 word direct answer** to that heading.
- Use `<h3>` for sub-points/steps.
- Insert **CTA markers** on their own line where a CTA should render: `[[CTA:mid]]`, `[[CTA:howto]]` (each id must exist in `cta_blocks`).
- Insert **image markers** on their own line where an inline image/diagram should render: `[[IMAGE:section-2]]` (each id must exist in `images`). The hero image marker is not needed in the body (it renders at the top from the `hero` image).
- Include 2–3 internal links (use relative paths like `/blog/<slug>/` or `https://vectormatch.dev`) and 2–4 external citations per ~1000 words as real `<a href>` links.
- No inline styles, no `<script>`, no `<h1>`, no `<html>/<body>` wrappers.

---

## 4. THE PROMPT (copy everything in the box)

```text
You are an expert technical content researcher and writer producing a single, publish-ready blog post for VectorMatch (https://vectormatch.dev), an AI-driven job-matching platform for web developers.

VECTORMATCH IN ONE LINE
VectorMatch helps developers skip the ATS black hole and pitch directly to decision-makers, using a 3-Gate matching funnel (tag screening → vector similarity → LLM reasoning) to surface high-fit, often hidden, roles — including remote and B2B/global contracts.

YOUR TOPIC (this session only)
- Topic/Title: {{TOPIC}}
- Category: {{CATEGORY}}
- Extra angle notes (optional): {{ANGLE_NOTES}}

AUDIENCE & TONE
- Readers are working web developers (React, Next.js, TypeScript, Node, PHP/Laravel, Python, etc.), mid-level to senior, frustrated with job boards and ATS filters, interested in remote and B2B/global contracts.
- Tone: practical, specific, data-backed, and slightly irreverent toward broken hiring systems. Developer-first — never explain basics like "what is React". No generic career-advice filler. No motivational fluff.
- Every post's conversion goal: get the reader to create a VectorMatch profile and upload a CV so the matching funnel can deliver direct pitches.

STEP 1 — RESEARCH (this is the most important step)
Conduct genuine, independent research. Prioritize PRIMARY community sources where this exact topic is discussed by real practitioners, because that is where the fresh, real pain and real answers live:
- Reddit (e.g. r/cscareerquestions, r/ExperiencedDevs, r/jobsearchhacks, r/cscareerquestionsEU, r/digitalnomad, r/recruitment, r/webdev, r/programming — pick the ones relevant to the topic)
- Hacker News (Ask HN, Show HN, "Who is hiring" threads, comment sections)
- Then supplement with fresh social/real-world sources: X (Twitter), LinkedIn posts/comments from engineers and recruiters, YouTube (talks, walkthroughs), Dev.to, Stack Overflow, IndieHackers.
- Then authoritative/official sources for facts: ATS vendor docs, salary/labor reports, developer surveys.
If you have browsing/live search, use it. If you do not, rely on your most current knowledge and be honest about it in the research appendix.

From this research, extract: the REAL pain points people express, the surprising or counter-intuitive truths, specific numbers, named tools, and direct-quote-worthy sentiments. The post must feel like it was written by someone who actually read these threads — not a generic summary.

SOURCE HONESTY (critical): Do NOT fabricate source URLs, domain names, or quotes. If you cite a source in the research_appendix, it must be a real, verifiable URL from a known publication (e.g. enhancv.com, unleash.ai, reddit.com, news.ycombinator.com, stackoverflow.blog, linkedin.com, official ATS vendor docs). If you cannot verify a URL, set it to null and note "unverified" in the source title. Fabricated domains like "atsverification.com" or "hiringexposed.com" are not acceptable. When in doubt, cite the platform and thread name without inventing a URL. Real Reddit threads (with full reddit.com/r/.../comments/.../ URLs) and real HN threads (news.ycombinator.com/item?id=...) are the strongest citations.

STEP 2 — UNIQUENESS BAR
Google (as of 2026) demotes content that merely repackages what already exists. Your post MUST add at least one of: proprietary framing, a named original framework, first-hand-style specific detail, or a fresh synthesis of community sentiment that isn't already a top search result. State explicitly (in the research appendix) what this post adds that isn't already on the web.

STEP 3 — STRUCTURE & SEO (follow exactly — these are hard constraints, not guidelines)
- SEO title: MUST be 55–60 characters. Count the characters before outputting. If yours is 54 or 67, it is wrong.
- Meta description: MUST be 135–160 characters. Count the characters before outputting. If yours is 168 or 186, it is wrong. Trim it.
- Slug: short, hyphenated, keyword-first.
- One primary keyword + 3–5 secondary keywords/entities. Put the primary keyword in the title, the hero direct answer (first 100 words), at least one H2, and the conclusion. Keep density natural (~1–2%), no keyword stuffing.
- Hero: a 15–25 word subtitle pitch + a 50–75 word "direct answer" paragraph that could stand alone in a Google AI Overview.
- Body: 3–5 H2 sections. EACH H2 — with no exceptions, including comparison or table sections — MUST be immediately followed by a <p> direct-answer paragraph of 40–60 words. If the section is a comparison table, the direct-answer paragraph comes BEFORE the table. Then go deep with examples, data, tables, or steps. Use H3 for sub-points. Keep most sentences under 20 words for clean AI extraction.
- Length: match the topic's competitiveness — aim 1,500–2,500 words for most topics; go longer only if the topic demands depth. Never pad.
- LINKING (critical — do not skip): Include 2–3 internal links as <a href> in the body HTML (relative /blog/... or https://vectormatch.dev). Include 2–4 authoritative external citations per ~1000 words as REAL <a href> links inside the body HTML — not just listed in the appendix. If you cite a source, link it inline where the claim is made. Do NOT write phrases like "external citations support this" without actual <a href> links.
- CITATION FORMAT (critical): Citations MUST be HTML anchor tags: <a href="https://example.com">linked text</a>. Do NOT use bracket-style reference placeholders like [reference:0], [1], [source:2], or any similar notation. These are NOT valid citations and will be rejected. Every external source you reference must be a clickable <a href> link embedded in the sentence where the claim appears.
- Include a FAQ of 3–5 real developer questions. EACH answer MUST be 40–80 words — do not write one-sentence answers. Aim for 50–60 words per answer to be safe.
- E-E-A-T: cite sources, use specifics, and write from a position of genuine expertise.

STEP 4 — CTAs
Include a hero CTA, 2 in-body CTAs, and 1 closing CTA. Copy must be first-person, benefit-driven, end with "→", link to https://vectormatch.dev. The "buyer_drive" field MUST be exactly ONE of these five single words: "save", "gain", "reduce", "increase", "improve". Do NOT use phrases like "reduce rejections" or "gain opportunities" — use only the single word. Contextualize the CTA to the category — e.g. ATS posts pitch ATS intelligence; remote posts pitch global B2B matching; career posts pitch profile optimization.

STEP 5 — IMAGES
Do NOT invent image URLs. For every image, provide: role, alt text, caption, a description, a generation prompt (use brand colors #7c3aed / #8b5cf6 / #a855f7 / #34d399 on dark background #16161e), and a stock-image search query. Only include a real "candidate_url" if you actually browsed and confirmed it resolves; otherwise set candidate_url to null and url_verified to false.

MANDATORY IMAGE REQUIREMENTS:
- You MUST include EXACTLY ONE image with role: "hero" (this is the hero/OG image rendered at the top). Its id must be "hero".
- You MUST include at least one additional inline image per ~1000 words of body content (role: "inline" or "diagram").
- The "role" field MUST be one of exactly three values: "hero", "inline", "diagram". No other values are allowed.

APPROVED CATEGORIES (choose exactly the one given as {{CATEGORY}})
ATS & Hiring Systems | Job Search Strategy | Remote & Global Work | Developer Career Growth | Market Intelligence | Product & Engineering

APPROVED TAGS (choose 2–5; these are DIFFERENT from categories — do NOT use a category name as a tag)
React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS, LinkedIn, Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization, AI, Networking, Portfolio, Skills, Seniority

CRITICAL: The tags list above is the ONLY allowed source for tag values. Category names (e.g. "Job Search Strategy", "ATS & Hiring Systems") are NOT tags and must NEVER appear in the tags array. If you are tempted to add a category name as a tag, pick a more specific tag from the list instead.

WRONG: "tags": ["Workday", "ATS", "Resume", "AI", "Job Search Strategy"]  ← "Job Search Strategy" is a CATEGORY, not a tag
CORRECT: "tags": ["Workday", "ATS", "Resume", "AI", "Seniority"]  ← all from the approved tag list only

OUTPUT FORMAT (STRICT)
Return ONLY one valid JSON object — no markdown fences, no commentary before or after. It must match this shape exactly:

{
  "meta": { "topic","category","tags"[],"title","seo_title","meta_description","slug","primary_keyword","secondary_keywords"[],"schema_types"[],"estimated_word_count","reading_time_minutes" },
  "hero": { "subtitle","direct_answer" },
  "key_takeaways": [ ... 3–5 strings ],
  "content_html": "semantic HTML body ONLY (no H1, no hero, no takeaways, no FAQ, no conclusion, no author box). First element is an <h2> 'Why ... matters in 2026'. EVERY <h2> — including comparison/table sections — must be immediately followed by a 40–60 word <p> direct answer BEFORE any table or other element. Put CTA markers like [[CTA:mid]] and image markers like [[IMAGE:section-2]] on their own lines where they should render. Include 2–3 internal <a href> links AND 2–4 external <a href> links per ~1000 words inline in the body. Allowed tags: h2,h3,p,ul,ol,li,table,thead,tbody,tr,th,td,blockquote,pre,code,a,strong,em. No inline styles, no scripts.",
  "cta_blocks": [ { "id","copy","url","buyer_drive","placement_note" } ],   // ids: hero, mid, howto, closing (as used). buyer_drive MUST be exactly one single word: "save" | "gain" | "reduce" | "increase" | "improve" — never a phrase
  "images": [ { "id","role","alt_text","caption","description","generation_prompt","suggested_search_query","candidate_url","url_verified" } ],  // role MUST be "hero" | "inline" | "diagram"; exactly ONE image must have role "hero" with id "hero"
  "faq": [ { "question","answer" } ],  // each answer MUST be 40–80 words (aim for 50–60); do NOT write one-sentence answers
  "conclusion": { "summary_html","closing_cta_id" },
  "author_box": { "byline","html" },
  "research_appendix": { "communities_consulted"[],"social_sources"[],"key_insights"[],"notable_quotes"[{ "quote","source","url" }],"sources"[{ "title","publisher","url","used_for" }],"uniqueness_statement" }
}

RULES RECAP (read this before outputting — verify each item)
- Output valid JSON only. Every marker in content_html must have a matching id in cta_blocks/images.
- Do not fabricate statistics, quotes, or source URLs. If you cannot verify a URL, set it to null. Real Reddit/HN/LinkedIn threads and known publications only.
- Do not include an H1 in content_html (title lives in meta.title).
- Tags must come ONLY from the approved tags list. Never use a category name as a tag.
- Images: exactly one with role "hero" (id "hero"), plus at least one "inline" or "diagram" per ~1000 words. Role values are strictly "hero" | "inline" | "diagram".
- Meta description MUST be 135–160 characters. SEO title MUST be 55–60 characters. Count them before outputting.
- EVERY <h2> in content_html must be immediately followed by a <p> of 40–60 words — no exceptions, even for table/comparison sections (put the <p> before the table).
- External citations must appear as real <a href> links inside content_html, not just in the appendix. Minimum 2–4 per ~1000 words. Do NOT use [reference:N] or [1] style placeholders — only <a href> tags.
- Internal links: minimum 2 as <a href> inside content_html.
- FAQ answers MUST be 40–80 words each. Do not write one-sentence answers.
- buyer_drive MUST be exactly one single word: "save" | "gain" | "reduce" | "increase" | "improve". Never a phrase.
- Tags: ONLY from the approved list. Category names are NOT tags. Example: "Job Search Strategy" is a category — do NOT put it in tags.
- Body MUST have exactly 3–5 <h2> sections — not 6, not 2.
- Write for developers, be specific, and make it genuinely useful and catchy.
```

---

## 5. Orchestrator Notes (Not Part of the LLM Prompt)

When parsing the returned JSON to publish via WPVibe:

1. **Validate** the JSON against the schema in Section 3. Reject/retry if any of these fail:
   - Markers in `content_html` reference missing ids in `cta_blocks` or `images`.
   - Required fields are empty.
   - `meta.tags` contains any value NOT in the approved 31-tag list (category names are NOT tags).
   - `images` does not contain exactly one entry with `role: "hero"` and `id: "hero"`.
   - Any `images[].role` value is not one of `"hero"`, `"inline"`, `"diagram"`.
   - `meta.meta_description` length is outside 135–160 characters.
   - `meta.seo_title` length is outside 55–60 characters.
   - `faq` has fewer than 3 entries or any answer is outside 40–80 words.
   - `content_html` contains an `<h1>` tag.
   - `content_html` does not start with an `<h2>` tag.
   - `content_html` contains more than 5 or fewer than 3 `<h2>` tags.
   - `hero.direct_answer` is outside 50–75 words.
   - `hero.subtitle` is outside 15–25 words.
   - Any `<h2>` in `content_html` is not immediately followed by a `<p>` (after optional markers) of 40–60 words. For table/comparison sections, the `<p>` must come before the `<table>`.
   - `content_html` contains fewer than 2 internal `<a href>` links.
   - `content_html` contains fewer than 2 external `<a href>` links.
   - `content_html` contains `[reference:` or `[source:` or `[^` bracket-style citation placeholders (these must be replaced with `<a href>` links by the LLM, not the orchestrator).
   - Any `cta_blocks[].buyer_drive` value is not exactly one of `"save"`, `"gain"`, `"reduce"`, `"increase"`, `"improve"`.
   - Any `research_appendix.sources[].url` that is non-null does not start with a known domain (reddit.com, news.ycombinator.com, linkedin.com, enhancv.com, forbes.com, huntr.co, substack.com, etc.) — flag for human review as potentially hallucinated.
2. **Assemble the body:** start with the hero (title as H1 handled by WordPress, then subtitle + direct answer), then the key-takeaways box, then `content_html` with markers replaced:
   - `[[CTA:<id>]]` → branded button (theme CTA style) using the matching `cta_blocks` entry.
   - `[[IMAGE:<id>]]` → `<figure>` with the uploaded image + caption; upload via WPVibe `upload_media` first.
   - Render the hero image at the top from the `images` entry with `role: hero`.
3. **FAQ:** render the `faq` array as the FAQ section AND generate `FAQPage` JSON-LD (or use the Rank Math FAQ block) — the array is the source of truth so the visible Q&A and schema never diverge.
4. **Conclusion + author box** appended after the FAQ.
5. **SEO:** push `seo_title`, `meta_description`, and `slug` to Rank Math fields; set the category and tags (all must already exist in the taxonomy).
6. **Images without verified URLs:** flag for a human/image-generation step before publish; never publish a broken `candidate_url`.
7. **Strip `research_appendix`** before publishing; optionally store it alongside the post record for auditing/quality review.
8. **Publish flow:** ensure Wordfence is inactive during agent work, publish as draft first, verify rendered HTML, then set to published and purge LiteSpeed Cache.

---

## 6. Placeholder Quick-Fill Example

```text
{{TOPIC}}      = How Workday Actually Ranks Candidates (No Hidden Auto-Reject Score)
{{CATEGORY}}   = ATS & Hiring Systems
{{ANGLE_NOTES}} = Emphasize pipeline-stage vs. ML-ranking distinction; cite recruiter POV from r/recruitment and HN.
```

---

## 7. Validation Lessons from Real Outputs

### Round 1 — Gemini (topic: "How Workday Actually Ranks Candidates") — ~85% compliant

| Issue found | Severity | Prompt fix applied |
|---|---|---|
| Category name "Job Search Strategy" used as a tag | Hard | Added explicit "do NOT use category names as tags" warning + critical block. |
| No hero image in `images` array | Hard | Added "MANDATORY IMAGE REQUIREMENTS" block: exactly one `role: "hero"` with `id: "hero"`. |
| Image `role` values were "Inline 1"/"Inline 2" instead of enum | Soft | Added strict enum constraint: `role` must be `"hero"` \| `"inline"` \| `"diagram"`. |
| Meta description 168 chars (8 over limit) | Soft | Added "count carefully" instruction + orchestrator validation rule. |
| SEO title 54 chars (1 under minimum) | Minor | Added orchestrator validation rule (55–60). |

**What worked well:** JSON structure, markers, all 5 H2 direct answers (50/43/44/42/44 words), 2 internal + 2 external links, excellent research appendix with real Reddit quotes and Enhancv/UNLEASH sources, high content quality.

### Round 2 — Grok (topic: "Greenhouse vs. Lever vs. Ashby") — ~60% compliant

The round-1 fixes all worked (tags, hero image, image role enum all passed). But new issues surfaced:

| Issue found | Severity | Prompt fix applied |
|---|---|---|
| `buyer_drive` values were phrases ("reduce rejections", "gain opportunities") not single enum words | Hard | Added explicit "MUST be exactly one single word" + listed the 5 values + "never a phrase" in STEP 4, JSON schema comment, and RULES RECAP. |
| 3 of 5 H2 direct answers too short (36, 31, 30 words — min is 40) | Hard | Strengthened to "with no exceptions, including comparison or table sections" + "the direct-answer paragraph comes BEFORE the table". |
| H2#5 (comparison table) had no direct-answer `<p>` at all — started with `<table>` | Hard | Same fix: "EVERY `<h2>` — including comparison/table sections — MUST be immediately followed by a `<p>`". |
| All 5 FAQ answers too short (37, 31, 32, 28, 27 words — min is 40) | Hard | Added "do NOT write one-sentence answers" + "aim for 50–60 words per answer to be safe" in STEP 3 and JSON schema comment. |
| Zero external `<a href>` links in body HTML (sources only in appendix) | Hard | Added explicit "as REAL `<a href>` links inside the body HTML — not just listed in the appendix" + "Do NOT write phrases like 'external citations support this' without actual `<a href>` links". |
| Only 1 internal link (min is 2) | Hard | Reinforced minimum 2 internal links in RULES RECAP. |
| Meta description 186 chars (26 over) | Soft | Changed from "count carefully" to "Count the characters before outputting. If yours is 168 or 186, it is wrong. Trim it." |
| SEO title 67 chars (7 over) | Soft | Same hardening: "If yours is 54 or 67, it is wrong." |
| Source URLs likely hallucinated (atsverification.com, hiringexposed.com, remotestack.in) | Quality | Added "SOURCE HONESTY" block: do NOT fabricate URLs; only real known domains; set to null if unverified. |

**What worked well:** JSON structure, tags all valid (fix worked!), hero image present (fix worked!), image roles valid enum (fix worked!), no H1, starts with H2, 5 H2s, no inline styles/scripts, CTA/IMAGE markers match, 5 takeaways, 5 FAQ items, conclusion valid.

### Round 3 — Deepseek (topic: "How Workday Actually Ranks Candidates" — same as Gemini R1) — ~76% compliant

The round-2 fixes largely worked: meta description and SEO title both passed (first model to achieve this), buyer_drive all single words (fix worked), hero image present, image roles valid. But new and recurring issues surfaced:

| Issue found | Severity | Prompt fix applied |
|---|---|---|
| "Job Search Strategy" used as tag (category as tag) — SAME as Gemini R1 | Hard | Added concrete WRONG/CORRECT example showing the exact mistake. |
| `[reference:0]`, `[reference:1]`... placeholders instead of `<a href>` links (17 found) | Hard | Added "CITATION FORMAT" block: explicitly prohibit `[reference:N]`, `[1]`, `[source:N]` brackets; require `<a href>` only. |
| 6 H2 sections (max is 5) | Hard | Added "Body MUST have exactly 3–5 `<h2>` sections — not 6, not 2" to RULES RECAP + orchestrator validation. |
| Zero internal links, zero external links in body (all citations were [reference:N] placeholders) | Hard | Addressed by the CITATION FORMAT fix above — once placeholders are prohibited, links must be `<a href>`. |
| Hero direct_answer 47 words (min 50) | Soft | Added orchestrator validation for hero.direct_answer 50–75 words. |
| 2 of 5 FAQ answers too short (39, 29 words) | Soft | Already addressed in R2 fix; this is a persistent word-count drift issue. |
| H2#5 direct answer 37 words (min 40) | Soft | Same persistent word-count drift. |

**What worked well (round-2 fixes confirmed):** Meta description ✅ (first pass!), SEO title ✅ (first pass!), buyer_drive all single words ✅, hero image ✅, image roles ✅, no H1, starts with H2, CTA/IMAGE markers match, all CTA blocks valid, research appendix with real sources (LinkedIn, Forbes, Huntr, Reddit, Substack — no hallucinated domains, SOURCE HONESTY block worked!).

### Cross-model comparison (3 models, same Workday topic for Gemini & Deepseek)

| Check | Gemini R1 | Grok R2 | Deepseek R3 |
|---|---|---|---|
| Meta description 135–160 | ❌ 168 | ❌ 186 | ✅ |
| SEO title 55–60 | ✅ 54 (borderline) | ❌ 67 | ✅ |
| Tags valid (no cat-as-tag) | ❌ | ✅ | ❌ (same as Gemini) |
| Hero image present | ❌ | ✅ | ✅ |
| Image role enum | ❌ | ✅ | ✅ |
| buyer_drive single word | ✅ | ❌ phrases | ✅ |
| H2 count 3–5 | ✅ 5 | ✅ 5 | ❌ 6 |
| H2 direct answers 40–60 | ✅ all | ❌ 3 short + 1 missing | ❌ 1 short |
| FAQ answers 40–80 | ✅ all | ❌ all short | ❌ 2 short |
| Internal links ≥ 2 | ✅ 2 | ❌ 1 | ❌ 0 |
| External links ≥ 2 | ✅ 2 | ❌ 0 | ❌ 0 ([reference:N]) |
| Source quality | High (real) | Low (hallucinated) | High (real) |

### Cross-model patterns (confirmed after 3 rounds)

- **Structural/enum constraints** (hero image, image roles, buyer_drive) are reliably fixed by explicit warnings — once hardened, all subsequent models pass.
- **Meta description / SEO title length** is fixable with concrete wrong-value examples — Deepseek is the first to pass both after the "If yours is 186, it is wrong" hardening.
- **Word-count constraints on body content** (H2 direct answers, FAQ answers) are persistently unreliable across ALL models — at least 1–2 failures per model. This appears to be a fundamental limitation of LLM instruction-following for precise word counts. **The orchestrator validation + retry loop is the real safety net.**
- **In-body linking is the hardest to enforce.** Each model fails differently: Gemini linked naturally, Grok put sources in appendix only, Deepseek used `[reference:N]` academic-style placeholders. The CITATION FORMAT prohibition addresses the Deepseek pattern but the orchestrator must validate link counts.
- **"Category as tag" recurs** even with explicit CRITICAL warnings — Gemini and Deepseek both did it. The concrete WRONG/CORRECT example is the latest attempt, but this may also require orchestrator-side validation as the ultimate safety net.
- **Research grounding varies by model.** Gemini and Deepseek produced real, verifiable sources; Grok hallucinated domains. The SOURCE HONESTY block helped Deepseek but cannot fully prevent hallucination — orchestrator domain checking is the safety net.
- **Content depth varies by model.** Gemini's post was the most deeply researched; Deepseek was solid; Grok was the most surface-level. This is a model-capability issue, not a prompt issue.

### Conclusion after 3 rounds

The prompt is now as hardened as it can reasonably be through prompt engineering alone. The remaining failures fall into two categories:
1. **Prompt-addressable** — the `[reference:N]` placeholder issue (now explicitly prohibited) and the category-as-tag issue (now has a concrete example).
2. **Not reliably prompt-addressable** — word-count drift on H2 direct answers and FAQ answers, and link count. These require **orchestrator-side validation + retry** as the ultimate safety net.

**Recommendation: proceed to orchestrator development.** The orchestrator should implement the full validation checklist in Section 5 step 1, automatically reject non-compliant outputs, and either retry with the same model or flag for manual review. No further prompt refinement is likely to produce materially better compliance without the validation loop.
