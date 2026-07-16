# WordPress Blog Post-Install Handoff

You are continuing the VectorMatch WordPress blog migration. Phases 0-4 are complete (MDX blog removed from Next.js, DB tables dropped, WordPress provisioned via Coolify, Traefik subpath routing configured and working). You are now implementing Phases 5-8: design system port, taxonomy + plugins + SEO, integration polish, and checkpoint.

## EXECUTION PHILOSOPHY

**The agent has direct WordPress access via the WPVibe MCP server.** This changes the execution model fundamentally:

1. **AGENT-AUTONOMOUS (default)** — Anything the agent can do through WPVibe MCP tools (`run_wp_cli`, `rest_api`, `write_file`, `edit_file`, `create_draft_theme`, `publish_draft_theme`, `upload_media`, `get_page_html`, Elementor REST endpoints, `load_skill`). The agent should execute these in batches without asking, reporting results after each batch. This now includes:
   - Plugin and theme installation/activation
   - Taxonomy creation (categories, tags)
   - Permalink configuration
   - Security hardening (options, mu-plugins)
   - Plugin configuration (options, REST API)
   - Elementor page/template creation (via Elementor REST endpoints)
   - Theme building (via draft-preview-publish workflow)
   - Media uploads (logo, images)
   - SEO schema configuration
   - Sitemap/RSS/route verification
   - Rendered HTML inspection

2. **REQUIRES USER (exception)** — The few things that genuinely need human action. When you reach these, STOP and walk the user through ONE step at a time with exact clicks, values, and expected outcomes. These are:
   - WPVibe site connection (one-click authorization in wp-admin) — **first action of the session**
   - Elementor Pro purchase decision (affects header/footer approach)
   - Wordfence 2FA setup (QR code scan)
   - UpdraftPlus cloud storage OAuth (Dropbox/Google Drive connection)
   - Cloudflare DNS record removal (dashboard action)
   - Final visual review of the blog

## FIRST ACTIONS (AGENT — DO IMMEDIATELY)

1. **List available WPVibe tools:** Call `mcp_list_tools` on the `wordpress` MCP server to discover the exact tool names and schemas available. Do this before calling any WPVibe tool.

2. **Connect the WordPress site:** Call `connect_site` with the site URL `https://vectormatch.dev/blog`. This will return a one-click authorization URL.

3. **PAUSE for user — WPVibe site connection (ONE step):**
   - Give the user the authorization URL returned by `connect_site`
   - Ask them to open it in their browser while logged into `https://vectormatch.dev/blog/wp-admin/`
   - They click "Authorize" — this creates a WordPress Application Password for WPVibe
   - Wait for the user to confirm, then continue

4. **Verify connection:** Call `site_info` to confirm the connection is active. Record the WordPress version, PHP version, active theme, and installed plugins. All subsequent documentation references should match the verified version.

5. **Load skills:** Call `load_skill` for any relevant skills before starting work:
   - Load the Elementor skill before Phase 5 work
   - Load the SEO skill before Phase 6 SEO configuration
   - These give you the correct schemas, workflows, and widget structures

6. **Fetch current documentation:** Visit `https://wordpress.org/documentation/` for the verified WordPress version (permalink settings, user roles, plugin/theme management, Settings API). Also fetch `https://elementor.com/help/` for Global Styles, Theme Builder, and container/widget basics. This ensures all actions are accurate and not obsolete.

## CURRENT STATE (VERIFIED WORKING AS OF JULY 14 2026)

### Infrastructure
- **Server:** Hetzner Cloud CX33, Helsinki (eu-central), IP 157.180.68.189
- **PaaS:** Coolify v4.1.2 with Traefik v3.6 reverse proxy
- **WordPress service:** Coolify one-click "WordPress with MariaDB" template
  - Service UUID: `a1yhworj7zx3hqhuhrrrkoui`
  - WordPress container: `wordpress-a1yhworj7zx3hqhuhrrrkoui` (image: `wordpress:latest`, Apache + PHP)
  - MariaDB container: `mariadb-a1yhworj7zx3hqhuhrrrkoui` (image: `mariadb:11`)
  - WordPress volume: `a1yhworj7zx3hqhuhrrrkoui_wordpress-files` → `/var/www/html`
  - MariaDB volume: `a1yhworj7zx3hqhuhrrrkoui_mariadb-data`
  - Host volume path: `/var/lib/docker/volumes/a1yhworj7zx3hqhuhrrrkoui_wordpress-files/_data`
- **URL:** `https://vectormatch.dev/blog` (subpath via Traefik stripprefix middleware)
- **Cloudflare:** Proxied, SSL Full (Strict), cf-cache-status: DYNAMIC (not caching WP pages)
- **Container health:** healthy
- **Admin access:** Working at `https://vectormatch.dev/blog/wp-admin/`

### Subpath Routing (3 volume-persisted files — DO NOT MODIFY unless explicitly needed)
1. **`wp-blog-defines.php`** (in volume root) — loaded by `wp-config.php` at line 131. Sets:
   - `WP_HOME` = `https://vectormatch.dev/blog`
   - `WP_SITEURL` = `https://vectormatch.dev/blog`
   - `DISALLOW_FILE_EDIT` = true
   - `FORCE_SSL_ADMIN` = true
   - HTTPS detection from `HTTP_X_FORWARDED_PROTO`
   - `REQUEST_URI` restoration (re-adds `/blog` prefix that Traefik stripprefix removes)
2. **`wp-content/mu-plugins/00-subpath-rewrite.php`** — filters `mod_rewrite_rules` to keep `.htaccess` root-based
3. **`.htaccess`** (in volume root) — root-based WordPress rewrites + a mod_rewrite block that handles directory-slash redirects (e.g., `/wp-admin` → `/blog/wp-admin/`). IMPORTANT: This redirect uses **302** (not 301) to prevent Chrome from permanently caching it. Do NOT change it back to 301.

### What was removed from the Next.js app
- All MDX blog code (`src/app/(public)/blog/**`, `src/lib/blog/**`, `src/components/mdx/**`, `src/components/blog/**`)
- MDX dependencies (`next-mdx-remote`, `gray-matter`, `remark-gfm`, `rehype-slug`, `rehype-autolink-headings`, `@shikijs/rehype`, `@tailwindcss/typography`)
- Giscus env vars
- Blog DB tables (`blog_categories`, `blog_tags`, `blog_posts`, `blog_post_tags`, `blog_comments`) — dropped via Drizzle migration
- Navbar/Footer still link to `/blog` (served by WordPress via Traefik)
- Next.js `sitemap.ts` includes `/blog` base URL
- Merged to `main` branch

### Pending manual action
- Remove `blog.vectormatch.dev` DNS record from Cloudflare DNS (no longer used) — Phase 7D

## DESIGN TOKENS (from src/app/globals.css — for Elementor Global Styles)

The Next.js app uses a dark-first design system. These are the exact values to replicate in Elementor:

### Dark mode (default — the blog should default to dark):
| Token | OKLCH value | Approximate hex |
|---|---|---|
| Background | `oklch(0.14 0.018 274)` | `#16161e` |
| Foreground (text) | `oklch(0.98 0.005 270)` | `#f5f5f7` |
| Card background | `oklch(0.24 0.03 274)` | `#2a2a35` |
| Primary (brand purple) | `oklch(0.6 0.23 292)` | `#7c3aed` |
| Primary bright | `oklch(0.7 0.22 296)` | `#8b5cf6` |
| Primary 2 (gradient end) | `oklch(0.64 0.21 312)` | `#a855f7` |
| Accent (emerald) | `oklch(0.79 0.17 165)` | `#34d399` |
| Accent 2 (emerald variant) | `oklch(0.78 0.15 150)` | `#10b981` |
| Muted foreground | `oklch(0.72 0.022 270)` | `#a1a1aa` |
| Border | `oklch(0.3 0.02 274)` | `#3f3f4a` |
| Radius | `0.875rem` | `14px` |

### Light mode (for reference — secondary):
| Token | OKLCH value | Approximate hex |
|---|---|---|
| Background | `oklch(0.98 0.005 270)` | `#fafafa` |
| Foreground | `oklch(0.22 0.03 274)` | `#1a1a2e` |
| Primary | same as dark | `#7c3aed` |
| Accent | `oklch(0.72 0.15 165)` | `#10b981` |

### Fonts:
- **Headings:** PT Serif (loaded via `next/font/google` in Next.js — use Google Fonts in Elementor)
- **Body:** Geist Sans (Vercel's font — available via Google Fonts or self-host; fallback: `ui-sans-serif, system-ui, sans-serif`)
- **Code/Mono:** Geist Mono (fallback: `ui-monospace, monospace`)

### Gradient (used in hero/buttons):
`linear-gradient(100deg, #8b5cf6 8%, #a855f7 92%)`

## TAXONOMY (from the original MDX blog — to pre-seed in WordPress)

### 6 Categories (with descriptions):
1. **ATS & Hiring Systems** — "How Greenhouse, Lever, Ashby, Workday, and other Applicant Tracking Systems actually rank and filter candidates — and how to use that knowledge to your advantage."
2. **Job Search Strategy** — "Tactics for standing out in a saturated market: direct pitching, bypassing HR bottlenecks, and finding hidden opportunities before the crowd."
3. **Remote & Global Work** — "Remote-first roles, work authorization, compliance (W-8BEN, B2B, EU Blue Card), and navigating international contractor arrangements."
4. **Developer Career Growth** — "Skills, positioning, salary negotiation, seniority progression, and building a credible developer profile."
5. **Market Intelligence** — "Data-driven analysis of the developer job market: which skills are rising, which are fading, and where the demand actually lives."
6. **Product & Engineering** — "Behind-the-scenes at VectorMatch: how the 3-Gate matching funnel works, engineering decisions, and product philosophy."

### 31 Tags:
- **Technologies:** React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python
- **ATS platforms:** Greenhouse, Lever, Ashby, Workday, SmartRecruiters
- **Topics:** ATS, LinkedIn, Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization, AI, Networking, Portfolio, Skills, Seniority

### 3 Seed posts (originally in MDX — to be re-created in WordPress LATER, NOT in this session):
1. "ATS vs LinkedIn" — category: Job Search Strategy, tags: ATS, LinkedIn
2. "How Greenhouse Works" — category: ATS & Hiring Systems, tags: ATS, Greenhouse
3. "React Job Market 2026" — tags: React, Next.js, TypeScript

## DETAILED PHASE INSTRUCTIONS

### Phase 5 — Design System Port [MOSTLY AGENT-AUTONOMOUS]

The agent can now do most of this phase via WPVibe MCP tools. The only decision point that requires the user is whether to use Elementor Pro (needed for Theme Builder header/footer templates) or a classic theme approach.

#### 5A. Install Hello Elementor theme + Elementor plugin [AGENT]
Use `run_wp_cli` for both:
```
wp theme install hello-elementor --activate
wp plugin install elementor --activate
```
Verify with `site_info` that the theme and plugin are active.

#### 5B. Elementor Pro decision [REQUIRES USER — ONE question]
Ask the user one question: **"Do you have Elementor Pro, or should I build the header/footer using a classic theme approach?"**
- **If yes (Elementor Pro available):** The agent will use `POST /wpvibe/v1/elementor/save-template` to create header and footer Theme Builder templates with display conditions.
- **If no (free Elementor only):** The agent will use `create_draft_theme` to build a classic child theme with PHP/Tailwind header and footer files, then `publish_draft_theme` to deploy it. This avoids the Elementor Pro requirement entirely while still matching the design system.

Do not proceed to 5C until the user answers.

#### 5C. Configure Elementor Global Styles [AGENT]
Use `run_wp_cli` to set Elementor's global design tokens via options, or use `rest_api` to call Elementor's settings endpoints. The exact values to set:

- **Colors (dark mode default):**
  - Background: `#16161e`
  - Text/Foreground: `#f5f5f7`
  - Primary: `#7c3aed`
  - Primary bright: `#8b5cf6`
  - Accent: `#34d399`
  - Muted text: `#a1a1aa`
  - Border: `#3f3f4a`
- **Typography:**
  - Headings: PT Serif (Google Fonts)
  - Body: Geist Sans (or fallback `ui-sans-serif, system-ui, sans-serif`)
  - Code: Geist Mono (or fallback `ui-monospace, monospace`)
- **Border radius:** 14px

Load the Elementor skill via `load_skill` first to get the exact option keys and REST endpoint schemas for global styles. Use `get_page_html` after applying to verify the rendered output matches.

#### 5D. Upload logo [AGENT]
Upload the VectorMatch logo to the WordPress media library:
- The logo is at `public/assets/Logos/VectorMatchLogo.png` in the local repo
- Use `upload_media` with a URL to the logo (if accessible via the Next.js app at `https://vectormatch.dev/assets/Logos/VectorMatchLogo.png`) or instruct the user to provide a URL
- Record the media ID for use in header template

#### 5E. Build header template [AGENT]
**If Elementor Pro:** Use `POST /wpvibe/v1/elementor/save-template` to create a header template with:
- Display condition: Entire Site
- Logo widget (media ID from 5D)
- Nav links: Home (`/`), Blog (`/blog`), Jobs (`/jobs`), About (`/about`), Contact (`/contact`)
- Sign Up / Sign In buttons linking to `/auth`
- Dark background (`#16161e`)

**If classic theme:** Use `edit_file` on the draft theme's `header.php` to build the same header with HTML/Tailwind matching the Next.js navbar.

Use `get_page_html` to verify the rendered header after publishing.

#### 5F. Build footer template [AGENT]
**If Elementor Pro:** Use `POST /wpvibe/v1/elementor/save-template` to create a footer template with:
- Display condition: Entire Site
- Company section: Blog, About, Contact links
- Legal section: Privacy, Terms, Compliance links
- Copyright notice
- Dark background (`#16161e`)

**If classic theme:** Use `edit_file` on the draft theme's `footer.php`.

Use `get_page_html` to verify.

#### 5G. Create CTA widget/template [AGENT]
Create a reusable CTA template for use in posts:
- Button linking to `/auth?tab=signup&ref=blog-cta`
- Styled with the brand gradient: `linear-gradient(100deg, #8b5cf6 8%, #a855f7 92%)`

Use `POST /wpvibe/v1/elementor/save-template` (Elementor Pro) or `write_file` to create a template PHP file (classic theme).

#### 5H. Publish and verify [AGENT]
- If using draft theme: call `publish_draft_theme` to make it live
- If using Elementor Pro templates: ensure templates are published with correct display conditions
- Call `get_page_html` on `https://vectormatch.dev/blog/` to verify the full rendered page
- Report the result to the user with a summary of what was built

### Phase 6 — Taxonomy + Plugins + Security [AGENT-AUTONOMOUS]

#### 6A. Install plugins [AGENT]
Use `run_wp_cli` to install and activate all plugins:
```
wp plugin install seo-by-rank-math --activate
wp plugin install wordfence --activate
wp plugin install updraftplus --activate
wp plugin install litespeed-cache --activate
```
Verify with `wp plugin list --status=active`.

#### 6B. Pre-seed taxonomy [AGENT]
Use `rest_api` to create categories and tags via the WordPress REST API:

**6 Categories** (POST to `/wp/v2/categories` with `name` and `description`):
1. ATS & Hiring Systems — "How Greenhouse, Lever, Ashby, Workday, and other Applicant Tracking Systems actually rank and filter candidates — and how to use that knowledge to your advantage."
2. Job Search Strategy — "Tactics for standing out in a saturated market: direct pitching, bypassing HR bottlenecks, and finding hidden opportunities before the crowd."
3. Remote & Global Work — "Remote-first roles, work authorization, compliance (W-8BEN, B2B, EU Blue Card), and navigating international contractor arrangements."
4. Developer Career Growth — "Skills, positioning, salary negotiation, seniority progression, and building a credible developer profile."
5. Market Intelligence — "Data-driven analysis of the developer job market: which skills are rising, which are fading, and where the demand actually lives."
6. Product & Engineering — "Behind-the-scenes at VectorMatch: how the 3-Gate matching funnel works, engineering decisions, and product philosophy."

**31 Tags** (POST to `/wp/v2/tags` with `name`):
React, Next.js, TypeScript, Tailwind CSS, GraphQL, Node.js, Vue, Angular, PHP, Laravel, Python, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, ATS, LinkedIn, Resume, Cover Letter, Interviews, Salary, Remote, Freelance, B2B, Work Authorization, AI, Networking, Portfolio, Skills, Seniority

Verify with `rest_api` GET `/wp/v2/categories?per_page=100` and GET `/wp/v2/tags?per_page=100`.

#### 6C. Configure permalinks [AGENT]
Use `run_wp_cli`:
```
wp rewrite structure '/%postname%/' --hard
wp rewrite flush --hard
wp option get permalink_structure
```
Verify the output is `/%postname%/`.

#### 6D. Security hardening [AGENT]
Use `run_wp_cli` for options:
```
wp option update users_can_register 0
wp option update default_comment_status closed
wp option update default_ping_status closed
wp option update default_pingback_flag 0
wp option update blog_public 1
wp plugin delete hello
wp plugin delete akismet
```

Use `write_file` to create the security mu-plugin at `wp-content/mu-plugins/01-security-hardening.php`:
```php
<?php
// Disable XML-RPC
add_filter('xmlrpc_enabled', '__return_false');

// Remove X-Pingback header
add_filter('wp_headers', function($headers) {
    unset($headers['X-Pingback']);
    return $headers;
});

// Disable REST API user enumeration
add_filter('rest_endpoints', function($endpoints) {
    if (isset($endpoints['/wp/v2/users'])) {
        unset($endpoints['/wp/v2/users']);
    }
    if (isset($endpoints['/wp/v2/users/(?P<id>[\d]+)'])) {
        unset($endpoints['/wp/v2/users/(?P<id>[\d]+)']);
    }
    return $endpoints;
});

// Remove WordPress version from head
remove_action('wp_head', 'wp_generator');

// Disable file editing (also in wp-blog-defines.php, but double-secure)
if (!defined('DISALLOW_FILE_EDIT')) {
    define('DISALLOW_FILE_EDIT', true);
}
```

#### 6E. Lock down taxonomy creation [AGENT]
Use `write_file` to create `wp-content/mu-plugins/02-lock-taxonomy.php`:
```php
<?php
// Lock down category and tag creation to administrators only.
// Preserves the closed vocabulary — the 6 categories and 31 tags
// defined in the blog's governed taxonomy.
add_filter('user_has_cap', function($allcaps, $caps, $args) {
    if (isset($args[0]) && in_array($args[0], ['manage_categories'], true)) {
        if (empty($allcaps['manage_categories']) && !current_user_can('administrator')) {
            $allcaps['manage_categories'] = false;
        }
    }
    return $allcaps;
}, 10, 3);
```

#### 6F. Configure RankMath SEO [AGENT]
Load the SEO skill via `load_skill` first. Then use `run_wp_cli` and `rest_api` to configure RankMath:

- Set the site to "Blog" category type
- Enable schema: Article, BreadcrumbList
- Configure sitemap settings
- Set social profiles (if the user provides URLs)
- Set the meta title/description templates for posts

Use `run_wp_cli` for RankMath options (prefix: `rank-math-options`):
```
wp option update rank_math_modules '{"sitemap":true,"schema":true,"breadcrumbs":true}'
```
Verify the sitemap at `/blog/sitemap_index.xml` using `get_page_html` or `rest_api`.

#### 6G. Configure LiteSpeed Cache [AGENT]
Use `run_wp_cli` to set LiteSpeed Cache options:
- Enable caching for logged-out users
- Enable image optimization + lazy-load
- Enable mobile cache

```
wp option update litespeed.conf.cache 1
wp option update litespeed.conf.optm-css_min 1
wp option update litespeed.conf.optm-js_min 1
wp option update litespeed.conf.media-lazy 1
wp option update litespeed.conf.cache-mobile 1
```
Verify with `wp option get litespeed.conf.cache`.

#### 6H. Configure Wordfence [AGENT — except 2FA]
Use `run_wp_cli` to configure Wordfence options:
- Set login attempt limits (5 attempts, 20 min lockout)
- Enable scan scheduling

```
wp option update wordfence_loginSec_maxFailures 5
wp option update wordfence_loginSec_lockoutMins 20
```

Run an initial scan via `run_wp_cli` if supported, or via `rest_api` to the Wordfence endpoint.

**REQUIRES USER — 2FA setup (ONE step):**
After the agent configures Wordfence options, pause and walk the user through enabling 2FA:
1. Go to `https://vectormatch.dev/blog/wp-admin/admin.php?page=WordfenceSec`
2. Click "Login Security" → "2FA" tab
3. Scan the QR code with an authenticator app (Authy, Google Authenticator)
4. Enter the 6-digit code to confirm
5. Save recovery codes somewhere safe

#### 6I. Configure UpdraftPlus [AGENT — except cloud storage OAuth]
Use `run_wp_cli` to configure backup schedule:
- Daily DB backups, weekly file backups
- Retention: keep 7 backups

```
wp option update updraft_interval 1
wp option update updraft_retention 7
```

**REQUIRES USER — cloud storage connection (ONE step, optional):**
If the user wants cloud backups (recommended):
1. Go to `https://vectormatch.dev/blog/wp-admin/options-general.php?page=updraftplus`
2. Click "Settings" tab
3. Choose a cloud storage provider (Dropbox, Google Drive, etc.)
4. Follow the OAuth flow to connect
5. Save settings

If the user declines cloud storage, backups will be stored locally on the server volume.

### Phase 7 — Integration Polish & Verification [MOSTLY AGENT]

#### 7A. Verify sitemap + RSS + schema [AGENT]
Use `get_page_html` or `rest_api` to verify:
- Sitemap: GET `https://vectormatch.dev/blog/sitemap_index.xml` — should return XML with sitemap entries
- RSS feed: GET `https://vectormatch.dev/blog/feed/` — should return valid RSS XML
- Schema: GET `https://vectormatch.dev/blog/` — check for `application/ld+json` in the HTML

Report any issues and fix them.

#### 7B. Verify all routes [AGENT]
Use `get_page_html` to verify each route returns expected content:
- `https://vectormatch.dev/blog` — blog homepage
- `https://vectormatch.dev/blog/wp-admin/` — admin login/redirect
- `https://vectormatch.dev/` — Next.js homepage (should still work)
- `https://vectormatch.dev/jobs` — Next.js jobs page (should still work)

Report status codes and any issues.

#### 7C. Performance audit [AGENT]
Use the Playwright MCP server (`playwright`) to:
1. Navigate to `https://vectormatch.dev/blog/`
2. Check page load metrics (LCP, CLS, TTFB)
3. Take a screenshot for visual verification
4. Check console for errors

If Playwright MCP is not available, use `get_page_html` to inspect the rendered HTML for obvious performance issues (unoptimized images, missing lazy-load, etc.).

Report the results. If performance targets are not met (Performance >= 95, LCP < 2.5s, CLS < 0.1, TTFB < 500ms), adjust LiteSpeed Cache settings and re-test.

#### 7D. Remove blog.vectormatch.dev DNS record [REQUIRES USER — ONE step]
This cannot be automated (no Cloudflare MCP configured). Walk the user through:
1. Go to Cloudflare dashboard → DNS → Records
2. Find the `blog` A record pointing to `157.180.68.189`
3. Delete it
4. Verify `blog.vectormatch.dev` no longer resolves (wait 1-5 min for DNS propagation)

### Phase 8 — Checkpoint [AGENT VERIFICATION + USER REVIEW]

#### 8A. Automated verification [AGENT]
Run a full verification pass and report results:

1. **Design match:** Use `get_page_html` on the blog homepage and compare the rendered design against the design tokens (dark background, correct fonts, correct colors, header/footer present)
2. **Taxonomy:** Use `rest_api` to list all categories (should be 6) and tags (should be 31)
3. **Permalinks:** Use `run_wp_cli` `wp option get permalink_structure` — should be `/%postname%/`
4. **Plugins:** Use `run_wp_cli` `wp plugin list --status=active` — should show Elementor, RankMath, LiteSpeed Cache, Wordfence, UpdraftPlus
5. **Security:** Verify mu-plugins are loaded (XML-RPC disabled, registration disabled, comments disabled, file edit disabled)
6. **Sitemap:** Verify `/blog/sitemap_index.xml` returns valid XML
7. **RSS:** Verify `/blog/feed/` returns valid RSS
8. **Routes:** Verify all routes from 7B still work
9. **Performance:** Report Playwright metrics from 7C

Present a summary table of all checks (PASS/FAIL) to the user.

#### 8B. User review [REQUIRES USER]
Ask the user to:
1. Open `https://vectormatch.dev/blog/` in their browser
2. Visually confirm the design matches the Next.js app (dark mode, fonts, colors, header/footer)
3. Confirm all 6 categories and 31 tags exist (or trust the agent's verification)
4. Confirm they completed the 2FA setup (6H) and DNS removal (7D)
5. Give approval to proceed, or list issues to fix

#### 8C. Update governing documents [AGENT]
After the user approves, update the governing documents if any details changed during implementation:
- `docs/governing/vectormatch-blueprint.md` — high-level product/architecture blueprint
- `docs/governing/VectorMatchTechicalImplementation.md` — detailed TDD

Both were updated to reflect the WordPress migration in the previous session. Update them again if any details changed.

#### 8D. Plan content population [AGENT — propose, USER approves]
Propose a plan for the content-population campaign as a SEPARATE stage:
- Re-creating the 3 seed posts in WordPress
- Scheduling a content calendar
- Defining the editorial workflow

Present this as a proposal for the user to approve in a future session.

## IMPORTANT NOTES FOR THE AGENT

1. **WPVibe MCP is your primary interface.** Use `run_wp_cli`, `rest_api`, `write_file`, `edit_file`, `upload_media`, `get_page_html`, `create_draft_theme`, `publish_draft_theme`, and Elementor REST endpoints for all WordPress operations. Do NOT ask the user to run docker exec commands — you have direct access now.

2. **Load skills before complex tasks.** Call `load_skill` for "elementor" before Phase 5 work and "seo" before Phase 6F. These give you the correct schemas and workflows.

3. **Draft-first workflow.** WPVibe is draft-first by design. Theme edits go to a draft, posts default to draft. Use `get_preview_url` to verify before publishing. Use `publish_draft_theme` only after verifying the preview.

4. **Do NOT modify the 3 existing routing files** (`wp-blog-defines.php`, `wp-content/mu-plugins/00-subpath-rewrite.php`, `.htaccess`) unless explicitly necessary. They are working correctly.

5. **The `.htaccess` directory-slash redirect uses 302, not 301.** This is intentional — Chrome permanently caches 301s (wontfix Chromium bug #40607542), which locked users out of `/blog/wp-admin`. Do NOT change it back to 301.

6. **Volume persistence:** Files written via `write_file` to `wp-content/mu-plugins/` survive Coolify redeploys. Files in the container's filesystem outside the volume do NOT survive redeploys.

7. **The blog should default to dark mode** — the Next.js app uses dark mode as default. The WordPress blog must match.

8. **CTA links must preserve the signup funnel** — use `/auth?tab=signup&ref=blog-cta` for blog-to-app conversion links.

9. **Governing documents** are at:
   - `docs/governing/vectormatch-blueprint.md` — high-level product/architecture blueprint
   - `docs/governing/VectorMatchTechicalImplementation.md` — detailed TDD
   Both were updated to reflect the WordPress migration in the previous session. Update them again if any details change during implementation.

10. **AGENTS.md rules:** Never run git commands. Never perform destructive operations without confirmation. Use Biome for formatting. Follow existing code conventions.

11. **When you reach a REQUIRES USER step:** STOP, clearly state what you need the user to do, provide exact URL/clicks/values, and wait. Do not attempt to proceed past it until the user confirms. Resume immediately after confirmation.

12. **Batch autonomous work:** For AGENT-AUTONOMOUS steps, execute them in batches and report results after each batch. Do not ask for permission between individual commands within a batch — only pause for REQUIRES USER steps.
