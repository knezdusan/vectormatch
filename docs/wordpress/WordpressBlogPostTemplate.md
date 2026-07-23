# VectorMatch WordPress Blog Post Template Spec — 2026 Research & Implementation Brief

This document is the single source of truth for anyone (human or LLM agent) creating a new post on the VectorMatch WordPress blog. It replaces the full TDD for content-generation tasks and is based on 2026 search-engine, AI-answer-engine, and conversion-optimization best practices.

Use it together with:
- `docs/wordpress-blog-research-brief.md` — purpose, audience, tone, taxonomy, technical setup.
- `docs/reports/WordpresBlogPostsPerCategory.md` — approved topics per category.

---

## 1. Research Summary: What Makes a WordPress Post Effective in 2026

### 1.1 Search is now answer-first
Google AI Overviews, ChatGPT Search, Perplexity, and Gemini are extracting direct answers from content before surfacing links. If your post is not structured as a clear question → short answer → deeper explanation, it risks being invisible even when it ranks.

Key implication for VectorMatch: every major section should open with a 40–60 word direct answer to the question in the heading. This is called **Answer Engine Optimization (AEO)** or **Generative Engine Optimization (GEO)**.

### 1.2 E-E-A-T is the differentiator
Google's quality systems evaluate **Experience, Expertise, Authoritativeness, and Trustworthiness**. In 2026, generic AI-paraphrased content is actively demoted. Posts must demonstrate:
- **Experience:** first-hand execution, specific numbers, personal or customer stories.
- **Expertise:** original frameworks, named methodologies, tool-specific knowledge.
- **Authoritativeness:** citations from reputable sources (Stack Overflow surveys, HN threads, LinkedIn labor reports, ATS documentation).
- **Trustworthiness:** author byline, updated dates, factual precision, external links to sources.

### 1.3 Content structure that ranks and converts
- **Title tag:** 55–60 characters, primary keyword near the front.
- **Meta description:** 135–160 characters, benefit-driven, include primary keyword.
- **URL slug:** short, hyphenated, keyword-first (e.g. `workday-ats-ranking-explained`).
- **H1:** one per post, closely matches the title and title tag.
- **Direct answer block:** the first paragraph (50–75 words) must answer the core query.
- **Heading hierarchy:** H2s as questions or statements, H3s as sub-steps or supporting points.
- **First 100 words:** must contain the primary keyword or a close variant.
- **Body length:**
  - Low keyword difficulty (KD 0–30): 800–1,500 words.
  - Medium KD (30–60): 1,500–2,500 words.
  - High KD (60+): 2,500+ words, with original data or frameworks.
- **Internal links:** 2–3 per post, descriptive anchor text.
- **External links:** 2–4 citations to authoritative sources per major claim.
- **Images:** one hero image, 1–2 images per major section, descriptive alt text, compressed (WebP preferred).
- **Schema:** Article, Author/Person, BreadcrumbList, FAQPage (where applicable), HowTo (where applicable).

### 1.4 Conversion/CRO best practices for 2026
- **Multiple CTAs per post:** long-form B2B content performs best with 2–4 in-line CTAs plus a closing CTA. Do not rely on a single sidebar newsletter box.
- **CTA copy:** first-person, action-oriented, benefit-driven. Examples:
  - Weak: "Learn more"
  - Better: "Get my 5 high-fit pitches"
  - Better: "Match me with B2B contracts that fit"
- **CTA placement:** above the fold (hero), after a proof or data section, after a how-to section, end of post.
- **Personalization by category:** ATS posts pitch ATS intelligence; remote-work posts pitch global B2B matching; career-growth posts pitch profile optimization.
- **Buyer drives:** every CTA should map to one of save, gain, reduce, increase, improve.

### 1.5 Technical must-haves
- **Core Web Vitals:** LCP < 2.5s, INP < 200ms, CLS < 0.1.
- **Mobile-first:** no horizontal scroll, touch targets ≥ 44×44px, readable font sizes.
- **Schema markup:** JSON-LD via Rank Math (already active).
- **Permalinks:** `/%postname%/` (already configured).
- **No keyword stuffing:** target density around 1–2%; prefer natural language and LSI/semantic synonyms.
- **Readability:** short sentences, sub-20 words for AEO extraction, scannable lists and tables.

---

## 2. VectorMatch Content Strategy Constraints

### 2.1 Audience & intent
Posts must be written for **web developers** who are frustrated with job boards and ATS black holes and want higher-quality, direct-pitch opportunities — ideally B2B/global contracts.

### 2.2 Tone
- Practical, specific, slightly irreverent toward broken hiring systems.
- Developer-first: do not explain what React is; do explain how an ATS parses a React portfolio.
- Data-backed: cite numbers, sources, and real tools.
- No generic career advice. No motivational filler.

### 2.3 Category & tag rules
- **One category per post** (choose from the 6 below).
- **2–5 tags per post** (from the approved tag list).

**Categories:**
1. ATS & Hiring Systems
2. Job Search Strategy
3. Remote & Global Work
4. Developer Career Growth
5. Market Intelligence
6. Product & Engineering

**Tags:** React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS, LinkedIn, Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization, AI, Networking, Portfolio, Skills, Seniority.

### 2.4 Primary conversion goal
Every post should drive the reader toward **creating a VectorMatch profile and uploading a CV** so the 3-Gate matching funnel can deliver direct pitches. CTAs must be contextual, not generic.

---

## 3. Recommended Elements & Plugins

### 3.1 Already active and relied upon
| Element/Plugin | Role in the template |
|---|---|
| **Rank Math SEO** | Title/meta management, Article/FAQ/HowTo/BreadcrumbList/Author schema, XML sitemap, Open Graph, readability analysis. |
| **Elementor (free)** | Optional layout blocks if a non-standard visual section is needed. Most posts should use the Gutenberg block editor for performance. |
| **LiteSpeed Cache** | Page caching and JS/CSS optimization. Ensure any new interactive element is excluded from JS optimization if it breaks. |
| **UpdraftPlus** | Daily backups. Before bulk publishing, run a manual backup. |
| **Wordfence** | Security. Stays active during automated agent work (application-password auth is not blocked by the firewall). |

### 3.2 Recommended additions (lightweight, justified)
The existing stack already covers SEO, caching, and security. Add plugins only when a feature cannot be achieved with Gutenberg + Rank Math + the custom theme.

| Element/Plugin | Why add it | When to use | Compliance note |
|---|---|---|---|
| **Rank Math FAQ / HowTo blocks** | Built into Rank Math. Adds FAQPage/HowTo JSON-LD automatically. | Every post with questions or steps. | No extra plugin; already active. |
| **Table of Contents block** | Gutenberg core or a lightweight TOC plugin (e.g. **Fixed TOC** or **Easy Table of Contents**) improves scroll behavior and anchor links. | Posts > 1,500 words. | Prefer a plugin that generates TOC from headings server-side and does not inject jQuery. |
| **SyntaxHighlighter Evolved** (or **Prism.js** in theme) | Code syntax highlighting for developer tutorials. | Product & Engineering posts, code-heavy strategy posts. | Test with LiteSpeed JS optimization; exclude from minification if corrupted. |
| **Image optimization** | Convert/compress images before upload; prefer WebP. WordPress can already serve `srcset`. | Every hero and in-post image. | Avoid heavy plugins; use ShortPixel or Imagify only if manual compression is not feasible. |
| **Internal linking module in Rank Math** | Suggests relevant existing posts while editing. | As the blog grows beyond 20 posts. | Already part of Rank Math. |
| **Social sharing (theme-integrated)** | Share buttons for LinkedIn, X, Hacker News. | If theme does not include them. | Avoid plugins that load third-party JS on every page; use a lightweight SVG-based solution. |

### 3.3 Elements to avoid
- **Heavy page-builder layouts for every post:** Elementor is available, but long-form articles should be written in Gutenberg for speed and AEO/GEO friendliness.
- **Comment systems:** comments are disabled; do not add Disqus or Jetpack comments.
- **Pop-ups and exit-intent overlays:** they degrade UX and can trigger CLS/INP penalties.
- **Cookie-consent banners unless legally required:** the blog does not run ads or third-party trackers; do not add unnecessary banners.
- **AI-generated "read more" carousels that create thin content:** only related-post links to real, relevant posts.
- **Newsletter subscription plugins for now:** the only conversion is VectorMatch sign-up. A secondary email capture can be added later after the core CTA is proven.

---

## 4. Unified Blog Post Template

Use this template for every new post. Replace bracketed sections with content. Each block has a purpose, target length, and formatting rules.

### 4.1 Frontmatter & metadata (Rank Math / WordPress)
```yaml
# Title (SEO / browser tab / H1 source)
title: "[Primary keyword + benefit, 55–60 chars]"

# Meta description
meta_description: "[Benefit-driven summary, 135–160 chars, include primary keyword]"

# URL slug (Settings → Permalinks must be Post name)
slug: "[primary-keyword-phrase-here]"

# Category (exactly one from approved list)
category: "[ATS & Hiring Systems | Job Search Strategy | Remote & Global Work | Developer Career Growth | Market Intelligence | Product & Engineering]"

# Tags (2–5 from approved list)
tags: ["[tag-1]", "[tag-2]", "[tag-3]"]

# Featured image (1200×630 recommended for Open Graph; compress to <100KB WebP)
featured_image: "[filename.webp]"
featured_image_alt: "[Describe image for accessibility and SEO]"

# Schema type
schema: "[Article | FAQPage | HowTo | combination: Article + FAQPage]"

# Author (use one consistent byline)
author: "[VectorMatch Team or named expert]"

# Updated date
published_date: "[YYYY-MM-DD]"
last_modified: "[YYYY-MM-DD]"
```

### 4.2 Post structure

#### BLOCK A — Hero / Above-the-fold
**Purpose:** immediate relevance + conversion hook.

```markdown
# [H1 = post title, matches title tag]

[Subtitle / short pitch — 1 sentence, 15–25 words. Explain the promise and who this is for.]

[Direct answer block — 50–75 words. Answer the core question immediately. Be specific. Include primary keyword in the first 100 words.]

[Hero CTA button — one strong action. Example: "Find B2B contracts that fit my stack →" or "Get direct pitches, not ATS black holes →"]
```

**Rules:**
- H1 = exactly one per post.
- Subtitle is not an H2; it is a paragraph or `p.lead` style.
- Direct answer block should be able to stand alone in an AI Overview.

---

#### BLOCK B — Key Takeaways Box
**Purpose:** capture featured snippets and satisfy skimmers.

```markdown
## What You’ll Learn

- [Takeaway 1: a concrete outcome]
- [Takeaway 2: a concrete outcome]
- [Takeaway 3: a concrete outcome]
- [Takeaway 4: a concrete outcome]
```

**Rules:**
- Use an unordered list.
- Each bullet is one line, benefit-first.
- This can also be formatted as an `aside` or `div.key-takeaways` if the theme supports it.

---

#### BLOCK C — Context / Why This Matters
**Purpose:** build E-E-A-T and justify the problem.

```markdown
## Why [Topic] Matters in 2026

[2–4 short paragraphs. Include:
- A data point or trend.
- The pain point the reader already feels.
- A brief statement of credibility ("we've parsed X roles," "ATS recruiters sort by Y").
- Primary keyword or close variant naturally included.]
```

**Length:** 150–250 words.

---

#### BLOCK D — Main Body Sections (3–5 H2s)
**Purpose:** deliver the value and satisfy search intent.

Each H2 should be a question or clear statement:
```markdown
## [H2 as question or statement]

[Direct answer block — 40–60 words, plain language, self-contained.]

[Detailed explanation, examples, data, screenshots, or step-by-step instructions.]

[Optional H3 subsection]
### [H3 sub-question or step]
[Supporting detail.]
```

**Rules per section:**
- Open with a direct answer block.
- Use H2 for major sections, H3 for sub-points.
- Include 1 image, table, or code block per major section where relevant.
- Add 1 internal link per major section when possible (to another VectorMatch blog post or a public feature page).
- Add 1–2 external citations to authoritative sources per 500 words.

**Recommended section archetypes by post type:**

| Post type | H2 structure |
|---|---|
| **Explainer** (e.g., "How Workday Ranks Candidates") | What it is → How it works → What recruiters actually see → How to respond → Common myths |
| **Comparison** (e.g., "Greenhouse vs. Lever vs. Ashby") | Criteria → Platform A → Platform B → Platform C → Verdict |
| **Tutorial/HowTo** (e.g., "W-8BEN for Developers") | Who needs it → Required documents → Step-by-step filing → Common mistakes → Timeline |
| **Market analysis** (e.g., "AI/ML Postings Up 163%") | Data source → The numbers → What it means for X role → Geographic/contract variations → Actionable takeaways |
| **Product/Engineering** (e.g., "The 3-Gate Funnel") | Problem → Gate 1 → Gate 2 → Gate 3 → Results/Tradeoffs |

---

#### BLOCK E — Visual & Media Requirements
**Mandatory:**
- **Hero image** at the top, 1200×630, WebP, <100KB, descriptive alt text.
- **One diagram, table, or annotated screenshot** per 1,000 words.
- **Code blocks** syntax-highlighted for Product & Engineering posts.

**Optional:**
- Infographic summarizing a process.
- Comparison table.
- Quote block with a recruiter, hiring manager, or developer quote (real or illustrative, clearly attributed).

**Rules:**
- All images must have alt text.
- Avoid stock-photo cliches (no handshake skyscrapers, no generic “team working” shots).
- Use VectorMatch brand colors for diagrams (`#7c3aed`, `#8b5cf6`, `#a855f7`, `#34d399`, `#16161e`).

---

#### BLOCK F — CTA Placement & Copy Matrix
Place CTAs in **2–4 locations** depending on length:

1. **Hero CTA** (after direct answer block).
2. **Mid-post CTA** (after a data/proof section, around 40% through).
3. **How-to CTA** (after a practical instruction, around 70% through).
4. **Closing CTA** (final block before conclusion).

**Per-category CTA copy suggestions:**

| Category | Primary CTA copy | Secondary CTA copy |
|---|---|---|
| ATS & Hiring Systems | "See which roles pass your ATS filters first →" | "Get a résumé parse report for your target roles →" |
| Job Search Strategy | "Build my direct-pitch pipeline →" | "Match me with hidden engineering roles →" |
| Remote & Global Work | "Find remote B2B contracts that fit my setup →" | "Check my global work-readiness →" |
| Developer Career Growth | "Get matched to senior/staff roles →" | "Optimize my profile for B2B rates →" |
| Market Intelligence | "Get roles that match rising skills →" | "See where my stack is in demand →" |
| Product & Engineering | "Try the matching engine on my CV →" | "Get early access to the next VectorMatch feature →" |

**CTA design rules:**
- Use a button, not a text link, for primary CTAs.
- Minimum touch target: 44×44px; preferred 48–60px height.
- First-person copy converts better than second-person.
- Every CTA maps to a buyer drive: save time, gain opportunities, reduce rejections, increase rate, improve fit.
- Link to `https://vectormatch.dev` or a relevant onboarding URL.

---

#### BLOCK G — FAQ Section (Required for most posts)
**Purpose:** AEO/GEO optimization, featured snippets, and FAQPage schema.

**Data flow:** put the FAQ data in the `faq` array of the post JSON. Keep the `content_html` free of hand-written FAQ markup. Instead, insert the placeholder `[[FAQ]]` where the FAQ section should appear. The publishing pipeline renders it using the shared component.

**Shared component:**
- `docs/wordpress/lib/faq_component.html` — presentational wrapper.
- `docs/wordpress/lib/faq_component.py` — renderer; call `render_faq(faq_items)` or run the script with a `faq.json` file.

```json
"faq": [
  {
    "question": "[Question directly related to the post topic?]",
    "answer": "[Concise answer, 40–80 words.]"
  }
]
```

```html
<!-- Do not write this by hand; use the [[FAQ]] placeholder -->
[[FAQ]]
```

**Rules:**
- 3–5 questions.
- Questions should be phrased the way a developer would search them.
- Answers must be accurate and self-contained.
- The component emits `FAQPage` JSON-LD schema automatically; enable `FAQPage` in the post `schema_types` field.

---

#### BLOCK H — Summary / Conclusion
**Purpose:** reinforce the takeaway and transition to the final CTA.

```markdown
## Summary

[2–3 short paragraphs. Restate the core insight, the reader's next step, and why acting now matters. Include the primary keyword naturally.]

[Final CTA button — strongest, benefit-first copy.]
```

---

#### BLOCK I — Author / Authority Box
**Purpose:** E-E-A-T signal.

```markdown
## About VectorMatch

[2–3 sentences about VectorMatch, the 3-Gate matching funnel, and why the team is qualified to write about developer hiring. Include a link to the main site.]
```

**Rules:**
- If a named author is used, include a short bio and a link to their author page.
- If "VectorMatch Team" is used, link to `/` or `/about`.

---

## 5. LLM Agent Instructions

When you are asked to research a topic and generate a blog post for VectorMatch, follow this exact workflow:

### Step 1 — Validate the topic
- Open `docs/reports/WordpresBlogPostsPerCategory.md` and confirm the topic is in the approved list.
- If it is not, flag it to the user and ask for approval before proceeding.

### Step 2 — Determine keyword & intent
- Identify one primary keyword (3–5 words) and 3–5 secondary keywords/entities.
- Search the target keyword and note the dominant format of the top 10 results (listicle, tutorial, explainer, comparison, data report).
- Match the post format to the dominant intent.

### Step 3 — Select category & tags
- Pick exactly one category from the approved 6.
- Pick 2–5 tags from the approved 31.
- Do not invent new categories or tags.

### Step 4 — Outline before drafting
- Produce an outline with H1, subtitle, 3–5 H2s, and H3s under each H2.
- Each H2 must open with a direct answer block.
- Mark where CTAs, images, tables, and FAQ items will go.

### Step 5 — Draft the post
- Follow the unified template in Section 4.
- Write in the VectorMatch tone (practical, data-backed, developer-first).
- Cite 2–4 authoritative external sources per 1,000 words.
- Include 2–3 internal links to other VectorMatch blog posts or feature pages.
- Add alt text to every image.
- Keep sentences short; sub-20 words for AEO-friendly extraction.

### Step 6 — SEO & schema
- Write a title tag (55–60 chars) and meta description (135–160 chars).
- Mark the post with the correct schema: `Article` always; add `FAQPage` if an FAQ section exists; add `HowTo` if step-by-step instructions exist.
- Ensure the primary keyword appears in the title, H1, first 100 words, at least one H2, and conclusion.

### Step 7 — CTA insertion
- Insert 2–4 CTAs using the per-category copy matrix.
- Each CTA must be a button linking to `https://vectormatch.dev` or a relevant onboarding URL.

### Step 8 — Pre-publish review
Run through the checklist in Section 6 before any post is finalized.

### Step 9 — Publish via the REST API publishing script
1. Ensure the environment variables are set: `WP_API_URL`, `WP_APP_USER`, `WP_APP_PASSWORD`, and (optionally) `UNSPLASH_ACCESS_KEY`.
2. Run `python3 docs/wordpress/lib/publish_post.py <post.json>` — the script uploads images, creates the post via `POST /wp/v2/posts`, sets the category and tags, and writes Rank Math SEO meta.
3. Verify the rendered HTML by visiting the published URL (or use `webfetch` on `https://vectormatch.dev/blog/<slug>/`).
4. Wordfence can stay active — application-password authentication is not blocked by the firewall.
5. Purge LiteSpeed Cache after publishing (the script flushes rewrite rules; a cache purge may be needed if LiteSpeed does not auto-purge).

---

## 6. Pre-Publish Checklist

Every post must pass this checklist before publishing.

### Metadata
- [ ] Title tag is 55–60 characters and front-loads the primary keyword.
- [ ] Meta description is 135–160 characters and includes a benefit.
- [ ] URL slug is short, hyphenated, and keyword-first.
- [ ] H1 matches the title closely and there is only one H1.
- [ ] Category is one of the 6 approved categories.
- [ ] Tags are 2–5 of the 31 approved tags.
- [ ] Featured image is 1200×630 WebP, <100KB, with descriptive alt text.

### Content & SEO
- [ ] Primary keyword appears in the first 100 words.
- [ ] Each H2 opens with a 40–60 word direct answer.
- [ ] Heading hierarchy is logical (H1 → H2 → H3, no skipped levels).
- [ ] Post length matches keyword difficulty target.
- [ ] At least 2–3 internal links with descriptive anchor text.
- [ ] At least 2–4 authoritative external citations per 1,000 words.
- [ ] FAQ section exists with 3–5 questions and answers.
- [ ] Article schema is enabled; FAQPage schema enabled if FAQ section exists; HowTo if applicable.
- [ ] No keyword stuffing; density stays around 1–2%.

### Conversion
- [ ] At least 2 CTAs are embedded in the body, plus one closing CTA.
- [ ] CTA copy is first-person and maps to save/gain/reduce/increase/improve.
- [ ] Every CTA links to `https://vectormatch.dev` or a relevant onboarding URL.

### Media & UX
- [ ] Hero image is compressed WebP with alt text.
- [ ] One image, table, or code block per 1,000 words.
- [ ] Code blocks use syntax highlighting (Product & Engineering posts).
- [ ] All images respect dark-mode color palette.

### Technical
- [ ] Post renders correctly on mobile (no horizontal scroll, 44px+ touch targets).
- [ ] No broken internal or external links.
- [ ] LiteSpeed Cache is purged after publishing.
- [ ] Sitemap is refreshed (Rank Math handles this automatically once active).

---

## 7. Examples

### Example title & meta
- **Title:** `How Workday Ranks Candidates (No Hidden Auto-Reject Score)`
- **Title tag:** `How Workday Ranks Candidates: No Hidden Auto-Reject Score`
- **Meta description:** `Recruiters sort Workday candidates by pipeline stage, not a secret score. Learn the real ranking logic and how to get seen faster.`
- **Slug:** `workday-ranks-candidates-pipeline-stage`
- **Category:** ATS & Hiring Systems
- **Tags:** Workday, ATS, Resume, Job Search Strategy

### Example H2 with direct answer block
```markdown
## Does Workday auto-reject candidates with a hidden score?

No. Workday does not assign a single hidden score that auto-rejects applicants. Instead, recruiters typically sort requisitions by application date and pipeline stage, which means your resume can be buried under newer or later-stage candidates within days.

To avoid disappearing, you need to understand the visible fields recruiters sort by and how Workday's ML-assisted ranking surfaces recent, keyword-relevant, and source-tracked applications.
```

### Example CTA
```markdown
[Get my résumé ranked for Workday roles →](https://vectormatch.dev)
```

---

## 8. Version & Maintenance

This template spec is tied to the 2026 WordPress/Rank Math setup described in `docs/wordpress-blog-research-brief.md`. Update it when:
- The approved categories or tags change.
- New plugins replace Rank Math or Elementor.
- Google/AI search behavior shifts materially.
- Conversion CTA data reveals better-performing copy.
