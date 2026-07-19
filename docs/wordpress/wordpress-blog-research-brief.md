# VectorMatch WordPress Blog — Research & Content Brief

A concise reference for researching and planning blog content for the VectorMatch WordPress installation. It replaces the full TDD for topic-discovery work and can be shared with researchers or content strategists.

---

## 1. Purpose & Audience

**Purpose:** The blog is the primary organic-SEO and education channel for VectorMatch. It should attract web developers who are tired of oversaturated job boards and want a smarter, AI-driven way to find roles that actually match their skills.

**Target audience:**
- Frontend / full-stack web developers (React, Next.js, TypeScript, Tailwind, Node, PHP/Laravel, etc.).
- Mid-level to senior developers looking for remote-first, global, or startup roles.
- Contractors and B2B freelancers navigating international hiring systems.
- Candidates who want to bypass HR gatekeepers and pitch directly to engineering teams.

**What the blog should make readers feel:**
- Informed about how ATS and hiring systems actually work.
- Empowered to apply smarter, not harder.
- Confident that VectorMatch understands the modern developer job market.

---

## 2. Positioning Within VectorMatch

- **Fully decoupled from the Next.js app.** The blog lives at `https://vectormatch.dev/blog` and is served by WordPress via the same Traefik reverse proxy. The Next.js app handles everything except `/blog/*`.
- **No in-repo content.** Posts, pages, categories, tags, and media are managed inside WordPress.
- **Shared brand.** The WordPress theme replicates the Next.js design system (dark mode, Geist + PT Serif fonts, brand colors, header/footer links) so the transition between `/blog` and the rest of the site is seamless.
- **Conversion goal:** Turn anonymous readers into registered users who upload a CV and start the AI matching flow.

---

## 3. Design System & Tone

### Visual identity
- **Default mode:** Dark.
- **Background:** `#16161e`
- **Card/elevated surfaces:** `#2a2a35`
- **Text:** `#f5f5f7`
- **Primary brand:** `#7c3aed` (purple) / `#8b5cf6` (bright purple) / `#a855f7` (gradient end)
- **Accent:** `#34d399` (emerald)
- **Muted text:** `#a1a1aa`
- **Borders:** `#3f3f4a`
- **Heading font:** PT Serif
- **Body font:** Geist Sans
- **Code/monospace font:** Geist Mono

### Editorial tone
- Practical, data-driven, and slightly irreverent toward broken hiring processes.
- Developer-first: assume the reader knows how to code and wants actionable insights.
- Avoid generic career advice. Prefer specific tactics, real examples, and system-level explanations.
- Cite numbers, timelines, and tool names whenever possible.

---

## 4. Taxonomy

The blog is pre-seeded with 6 categories and 31 tags. Every post should map to **one category** and **2–5 tags**.

### Categories (pick one per post)

| Category | What it covers |
|---|---|
| **ATS & Hiring Systems** | How Greenhouse, Lever, Ashby, Workday, SmartRecruiters, and other ATS rank, filter, and route candidates. How to reverse-engineer them. |
| **Job Search Strategy** | Direct pitching, bypassing HR, finding hidden opportunities, cold outreach, portfolio positioning, referral tactics. |
| **Remote & Global Work** | Remote-first roles, work authorization, B2B compliance, W-8BEN, EU Blue Card, contractor arrangements, international payroll. |
| **Developer Career Growth** | Skill building, salary negotiation, seniority progression, reputation management, public portfolio. |
| **Market Intelligence** | Data-driven analysis of which skills are rising/fading, salary trends, demand signals from ATS/job boards. |
| **Product & Engineering** | Behind-the-scenes at VectorMatch: the 3-Gate matching funnel, engineering decisions, product philosophy, AI/LLM workflows. |

### Tags (pick 2–5 per post)

**Skills & frameworks:** React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python, Skills, Seniority.

**ATS & platforms:** Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS.

**Job-search mechanics:** LinkedIn, Resume, Cover Letter, Interviews, Salary, Networking, Portfolio, AI.

**Work models:** Remote, Freelance, B2B, Work Authorization.

---

## 5. Content Strategy Pillars

Plan topics around these recurring angles. Each should tie back to VectorMatch's mission: **get hired on your terms by matching the right roles intelligently.**

1. **ATS transparency.** Explain how specific ATS features (requisition scoring, keyword filters, source tracking) affect a developer's application.
2. **Direct pitching.** Show concrete examples of emails, LinkedIn messages, and GitHub outreach that skip the application form.
3. **Remote & global contracting.** Decode B2B paperwork, compliance, and payment setup for international developers.
4. **Skill market data.** Use public data (job boards, Hacker News, Stack Overflow surveys, GitHub trends) to show which skills are in demand for remote roles.
5. **Career positioning.** Help developers package their experience, choose the right seniority framing, and negotiate from strength.
6. **VectorMatch engineering.** Share how the 3-Gate funnel, embeddings, and LLM arbitration work — without exposing sensitive architecture.

---

## 6. Technical Setup Summary

| Element | Current State |
|---|---|
| **Platform** | WordPress 7.0.1 + MariaDB 11, deployed as a Coolify service on Hetzner CX33. |
| **URL** | `https://vectormatch.dev/blog` (subpath via Traefik `stripprefix`). |
| **Admin** | `https://vectormatch.dev/blog/wp-admin/` |
| **Theme** | `vectormatch-blog` — custom classic PHP theme that mirrors the Next.js design system. |
| **Fonts** | Geist Sans, Geist Mono, PT Serif via Google Fonts. |
| **Styling** | Tailwind CSS v4 utility classes; design tokens live in `theme.css`. |
| **Permalinks** | `/%postname%/` — posts appear as `https://vectormatch.dev/blog/<slug>/`. |
| **Comments** | Disabled by default. Pingbacks disabled. |
| **Registration** | Disabled (`users_can_register = 0`). |

### Active plugins
- **Elementor (free)** — for optional future content blocks; not used for header/footer/templates.
- **Rank Math SEO** — sitemap, schema, Open Graph, meta/title management.
- **LiteSpeed Cache** — page cache + asset optimization.
- **UpdraftPlus** — daily DB backups, 7-day retention.
- **Wordfence Security** — currently inactive; will be reactivated after final 2FA setup.
- **WPVibe** — MCP bridge used by the Devin agent to manage the site.

### Removed
- Akismet Anti-spam (uninstalled).
- All in-repo MDX blog code and `blog_*` database tables.

---

## 7. Publishing Workflow

### For human authors/admins
1. Log in at `https://vectormatch.dev/blog/wp-admin/`.
2. Create a post in **Posts → Add New** (or use the Gutenberg block editor).
3. Select one category from the 6 pre-seeded categories.
4. Add 2–5 relevant tags from the pre-seeded tag list. Do not create new categories/tags unless an admin approves them.
5. Set a featured image (recommended) and an excerpt.
6. Publish.
7. Rank Math automatically generates per-post SEO metadata and Open Graph tags once the setup wizard is completed.

### For the Devin agent via WPVibe
1. Connect: `connect_site("https://vectormatch.dev/blog")` → user authorizes in wp-admin.
2. Inspect: `site_info` to verify active theme, plugins, and capabilities.
3. Draft content: `rest_api` to create posts, categories, tags, pages.
4. Media: `upload_media` to add images to the WordPress library.
5. Theme edits: `create_draft_theme` → `write_file`/`edit_file` → `publish_draft_theme`.
6. Cache/rewrite: after permalink or theme changes, run `wp rewrite flush` and let LiteSpeed auto-purge.

---

## 8. SEO & Sitemap

- **Next.js sitemap:** includes `/blog` so search engines discover the WordPress section.
- **WordPress interim sitemap:** `https://vectormatch.dev/blog/wp-sitemap.xml` (works today).
- **Canonical sitemap (pending):** `https://vectormatch.dev/blog/sitemap_index.xml` will be activated once the Rank Math setup wizard is completed in wp-admin.
- **RSS feed:** `https://vectormatch.dev/blog/feed/`
- **Open Graph / schema:** handled by Rank Math after setup wizard completion.

---

## 9. Constraints & Manual Steps

These items require human action in wp-admin or elsewhere and are not automatable via WPVibe:

1. **Rank Math setup wizard** — must be completed to activate `/blog/sitemap_index.xml` and JSON-LD schema.
2. **Wordfence activation + 2FA** — Wordfence must be reactivated after agent work and 2FA/login settings configured. It is kept inactive during agent work because its firewall blocks WPVibe authentication.
3. **UpdraftPlus remote storage** — daily backups run locally; connecting Google Drive / Dropbox / S3 requires OAuth in wp-admin.
4. **Category/tag creation** — restricted to WordPress administrators. Researchers should use the existing 6 categories and 31 tags unless they request a new one.
5. **DNS cleanup** — `blog.vectormatch.dev` should be removed from Cloudflare DNS (it is no longer used; the blog lives at `vectormatch.dev/blog`).

---

## 10. WPVibe / Agent Notes (For Reference)

- **WPVibe is the MCP bridge** for Devin to manage the WordPress site via `run_wp_cli`, `rest_api`, `write_file`, `edit_file`, and theme draft/publish operations.
- **Wordfence blocks WPVibe:** keep Wordfence deactivated during automated work; reactivate only after the agent is finished.
- **DISALLOW_FILE_EDIT is enabled:** security hardening is enforced in the theme's `functions.php` rather than standalone mu-plugins.
- **LiteSpeed Cache:** excludes Alpine.js from JS optimization because the minifier corrupts its source-map comment. If future console errors appear, check for newly optimized scripts.
- **Approval tier:** plugin installs and option updates are generally autonomous; plugin uninstalls and file deletions require explicit user approval through a WPVibe link.

---

## Quick Reference: Approved Categories & Tags

```text
Categories:
- ATS & Hiring Systems
- Job Search Strategy
- Remote & Global Work
- Developer Career Growth
- Market Intelligence
- Product & Engineering

Tags:
React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP,
Laravel, Python, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS, LinkedIn,
Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization,
AI, Networking, Portfolio, Skills, Seniority
```
