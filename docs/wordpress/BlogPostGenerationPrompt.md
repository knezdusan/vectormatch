# VectorMatch Blog Post Generation — External LLM Prompt Template

This document contains the **exact prompt** to paste into a fresh session of any flagship LLM (Grok, Gemini, Claude, Kimi, GPT, etc.) to generate one publish-ready VectorMatch blog post per session, plus the rationale and the machine-readable output contract your orchestrator will parse and push to WordPress via the WPVibe MCP server.

---

## 1. How to Use This

**Per session, per topic:**
1. Open a new session with one flagship LLM.
2. (Optional but recommended) Attach these two files for deeper context:
   - `docs/reports/WordpressBlogPostTemplate.md` (full structure spec)
   - `docs/wordpress-blog-research-brief.md` (audience, tone, taxonomy)
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
      "id": "hero",                     // must match a [[IMAGE:hero]] marker (hero is at the top)
      "role": "hero|inline|diagram",
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

STEP 2 — UNIQUENESS BAR
Google (as of 2026) demotes content that merely repackages what already exists. Your post MUST add at least one of: proprietary framing, a named original framework, first-hand-style specific detail, or a fresh synthesis of community sentiment that isn't already a top search result. State explicitly (in the research appendix) what this post adds that isn't already on the web.

STEP 3 — STRUCTURE & SEO (follow exactly)
- SEO title: 55–60 characters, primary keyword first.
- Meta description: 135–160 characters, benefit-driven, includes primary keyword.
- Slug: short, hyphenated, keyword-first.
- One primary keyword + 3–5 secondary keywords/entities. Put the primary keyword in the title, the hero direct answer (first 100 words), at least one H2, and the conclusion. Keep density natural (~1–2%), no keyword stuffing.
- Hero: a 15–25 word subtitle pitch + a 50–75 word "direct answer" paragraph that could stand alone in a Google AI Overview.
- Body: 3–5 H2 sections. EACH H2 must open with a 40–60 word direct-answer paragraph, then go deep with examples, data, tables, or steps. Use H3 for sub-points. Keep most sentences under 20 words for clean AI extraction.
- Length: match the topic's competitiveness — aim 1,500–2,500 words for most topics; go longer only if the topic demands depth. Never pad.
- Include 2–3 internal links (relative /blog/... or https://vectormatch.dev) and 2–4 authoritative external citations per ~1000 words.
- Include a FAQ of 3–5 real developer questions with 40–80 word answers.
- E-E-A-T: cite sources, use specifics, and write from a position of genuine expertise.

STEP 4 — CTAs
Include a hero CTA, 2 in-body CTAs, and 1 closing CTA. Copy must be first-person, benefit-driven, end with "→", link to https://vectormatch.dev, and map to a buyer drive (save/gain/reduce/increase/improve). Contextualize the CTA to the category — e.g. ATS posts pitch ATS intelligence; remote posts pitch global B2B matching; career posts pitch profile optimization.

STEP 5 — IMAGES
Do NOT invent image URLs. For every image, provide: role, alt text, caption, a description, a generation prompt (use brand colors #7c3aed / #8b5cf6 / #a855f7 / #34d399 on dark background #16161e), and a stock-image search query. Only include a real "candidate_url" if you actually browsed and confirmed it resolves; otherwise set candidate_url to null and url_verified to false. Provide at minimum a hero image and one inline diagram/image per ~1000 words.

APPROVED CATEGORIES (choose exactly the one given as {{CATEGORY}})
ATS & Hiring Systems | Job Search Strategy | Remote & Global Work | Developer Career Growth | Market Intelligence | Product & Engineering

APPROVED TAGS (choose 2–5)
React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS, LinkedIn, Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization, AI, Networking, Portfolio, Skills, Seniority

OUTPUT FORMAT (STRICT)
Return ONLY one valid JSON object — no markdown fences, no commentary before or after. It must match this shape exactly:

{
  "meta": { "topic","category","tags"[],"title","seo_title","meta_description","slug","primary_keyword","secondary_keywords"[],"schema_types"[],"estimated_word_count","reading_time_minutes" },
  "hero": { "subtitle","direct_answer" },
  "key_takeaways": [ ... 3–5 strings ],
  "content_html": "semantic HTML body ONLY (no H1, no hero, no takeaways, no FAQ, no conclusion, no author box). First element is an <h2> 'Why ... matters in 2026'. Each <h2> immediately followed by a 40–60 word <p> direct answer. Put CTA markers like [[CTA:mid]] and image markers like [[IMAGE:section-2]] on their own lines where they should render. Allowed tags: h2,h3,p,ul,ol,li,table,thead,tbody,tr,th,td,blockquote,pre,code,a,strong,em. No inline styles, no scripts.",
  "cta_blocks": [ { "id","copy","url","buyer_drive","placement_note" } ],   // ids: hero, mid, howto, closing (as used)
  "images": [ { "id","role","alt_text","caption","description","generation_prompt","suggested_search_query","candidate_url","url_verified" } ],
  "faq": [ { "question","answer" } ],
  "conclusion": { "summary_html","closing_cta_id" },
  "author_box": { "byline","html" },
  "research_appendix": { "communities_consulted"[],"social_sources"[],"key_insights"[],"notable_quotes"[{ "quote","source","url" }],"sources"[{ "title","publisher","url","used_for" }],"uniqueness_statement" }
}

RULES RECAP
- Output valid JSON only. Every marker in content_html must have a matching id in cta_blocks/images.
- Do not fabricate statistics or quotes — attribute them; if unsure, mark them clearly in the appendix.
- Do not include an H1 in content_html (title lives in meta.title).
- Write for developers, be specific, and make it genuinely useful and catchy.
```

---

## 5. Orchestrator Notes (Not Part of the LLM Prompt)

When parsing the returned JSON to publish via WPVibe:

1. **Validate** the JSON against the schema in Section 3; reject/retry if markers reference missing ids or required fields are empty.
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
