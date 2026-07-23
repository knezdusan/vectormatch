# WordPress Publishing Without WPVibe — Analysis & Migration Plan

## Executive Summary

**WPVibe is not needed for publishing blog posts.** The actual post creation is already done via `curl` + WordPress REST API + Application Passwords. WPVibe is only used as a convenience wrapper for three things: (1) creating application passwords, (2) searching Unsplash for stock images, and (3) uploading images from a URL. All three can be replaced with direct curl calls and a free Unsplash API key. This document explains the current architecture, what WPVibe actually does, and how to publish posts without it.

---

## 1. Current Architecture

### WordPress deployment
- **Host:** Hetzner CX33, managed by Coolify 4.1.2
- **Stack:** WordPress 7.0.1 + MariaDB 11, deployed as a Coolify service (`wordpress-with-mariadb`)
- **URL:** `https://vectormatch.dev/blog` (subpath via Traefik `stripprefix`)
- **Theme:** `vectormatch-blog` — custom classic PHP theme with Tailwind CSS v4
- **Plugins:** Rank Math SEO, LiteSpeed Cache, Elementor (free), UpdraftPlus, Wordfence (inactive), WPVibe

### What actually happens when we publish a post

Looking at the real workflow from this session and previous sessions:

| Step | Tool used | What it does | Can be done without WPVibe? |
|---|---|---|---|
| 1. Parse JSON | Python script (`/tmp/post_*.json`) | Reads the blog post JSON, assembles HTML content | Yes — pure local Python |
| 2. Render FAQ | `docs/wordpress/lib/faq_component.py` | Generates accordion FAQ HTML + JSON-LD schema | Yes — pure local Python |
| 3. Search images | WPVibe `search_images` | Searches Unsplash, returns URLs | Yes — Unsplash API directly (free tier: 50 req/hour) |
| 4. Upload images | WPVibe `upload_media` | Downloads image from URL, uploads to WP media library | Yes — curl download + curl upload to `/wp/v2/media` |
| 5. Create app password | WPVibe `rest_api` → `POST /wp/v2/users/1/application-passwords` | Creates a temporary application password | Yes — curl with existing app password, or create once in wp-admin |
| 6. Create post | `curl` directly to `POST /wp/v2/posts` | Creates the WordPress post | **Already doing this without WPVibe** |
| 7. Verify post | `webfetch` on the live URL | Fetches rendered HTML to verify | **Already doing this without WPVibe** |
| 8. Delete app password | `curl` directly to `DELETE /wp/v2/users/1/application-passwords/{uuid}` | Revokes the temporary password | **Already doing this without WPVibe** |
| 9. Search post content | WPVibe `rest_api` → `POST /wpvibe/v1/content/search` | Searches inside post content for verification | Yes — `GET /wp/v2/posts/{id}?_fields=content` + grep, or WP-CLI |

### Key finding

**Steps 6, 7, and 8 are already done without WPVibe.** We use `curl` directly with application passwords to create posts, `webfetch` to verify them, and `curl` to delete the temporary password. WPVibe is only used for:
1. **`search_images`** — Unsplash image search (hit the free-plan daily limit)
2. **`upload_media`** — Image upload from URL (also hit the daily limit)
3. **`rest_api`** — Used to create application passwords and search post content

---

## 2. What WPVibe Actually Provides

WPVibe is a WordPress plugin that registers custom REST API endpoints under the `/wp-json/wpvibe/v1/` namespace. The full list of custom endpoints:

```
GET  /wpvibe/v1/site-info
GET  /wpvibe/v1/registered-meta
POST /wpvibe/v1/file/read          — read theme files
GET  /wpvibe/v1/file/list          — list theme files
POST /wpvibe/v1/file/search        — search theme files
POST /wpvibe/v1/file/outline       — outline theme files
POST /wpvibe/v1/file/edit          — edit theme files
POST /wpvibe/v1/file/write         — write theme files
POST /wpvibe/v1/file/delete        — delete theme files
POST /wpvibe/v1/content/edit       — edit post content (replace_all)
POST /wpvibe/v1/content/search     — search post content
POST /wpvibe/v1/draft-theme        — create draft theme
POST /wpvibe/v1/draft-theme/publish — publish draft theme
GET  /wpvibe/v1/draft-theme/preview — preview draft theme
POST /wpvibe/v1/draft-theme/delete — delete draft theme
POST /wpvibe/v1/cli/run            — run WP-CLI commands
GET  /wpvibe/v1/audit-log          — get audit log
POST /wpvibe/v1/audit-log/record   — record audit log
POST /wpvibe/v1/cli/run-approved   — run approved WP-CLI commands
POST /wpvibe/v1/code-snippet       — execute code snippet
GET  /wpvibe/v1/cli/status         — get CLI status
POST /wpvibe/v1/builder-login      — builder login
POST /wpvibe/v1/rendered-html      — get rendered HTML
POST /wpvibe/v1/create-classic-theme — create classic theme
POST /wpvibe/v1/upload-media       — upload media from URL
GET  /wpvibe/v1/last-change        — get last change
POST /wpvibe/v1/navigate           — navigate
GET  /wpvibe/v1/elementor/widgets  — get Elementor widgets
GET  /wpvibe/v1/elementor/schema    — get Elementor schema
GET  /wpvibe/v1/elementor/style-schema — get Elementor style schema
POST /wpvibe/v1/elementor/save-page — save Elementor page
POST /wpvibe/v1/elementor/save-template — save Elementor template
POST /wpvibe/v1/beaver/save-page   — save Beaver Builder page
GET  /wpvibe/v1/beaver/modules     — get Beaver Builder modules
GET  /wpvibe/v1/beaver/schema       — get Beaver Builder schema
GET  /wpvibe/v1/ping               — ping
```

### What we actually use from WPVibe

Only **3 endpoints** are used in the blog publishing workflow:

1. **`POST /wpvibe/v1/upload-media`** — Downloads an image from a URL and uploads it to the WordPress media library. The standard WP REST API (`POST /wp/v2/media`) only accepts file uploads (multipart form data), not URLs. WPVibe acts as a proxy: it downloads the image server-side and then uploads it to WordPress.

2. **`POST /wpvibe/v1/content/search`** — Searches inside post content for verification (e.g., checking that FAQ accordion items were rendered correctly). The standard WP REST API doesn't have a content search endpoint.

3. **`POST /wpvibe/v1/cli/run`** (via `rest_api` tool) — Used to run WP-CLI commands like `wp post meta update` for Rank Math SEO fields. The standard WP REST API doesn't expose WP-CLI.

### What we do NOT use from WPVibe

- Theme file editing (`/file/*`, `/draft-theme/*`) — we edit theme files via Coolify/SSH
- Elementor/Beaver Builder endpoints — we use Gutenberg, not page builders
- Audit log, code snippets, builder login — not relevant to blog publishing

---

## 3. Direct Alternatives (No WPVibe Required)

### 3.1. Application Passwords (already working)

Application passwords are a **core WordPress feature** (since WP 5.6), not a WPVibe feature. They are created at:
- `wp-admin → Users → Your Profile → Application Passwords`
- Or via REST API: `POST /wp/v2/users/1/application-passwords` (requires existing auth)

**Current workflow:** We create a temporary app password for each post, use it, then delete it. This is overly cautious. A better approach:

**Recommended:** Create ONE persistent application password named `devin-blog-publisher` in wp-admin, store it in the project `.env` file, and reuse it for every post. No need to create/delete per session.

```bash
# .env addition
WP_APP_USER=stacionari
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

### 3.2. Post Creation (already working via curl)

This is already done without WPVibe. The curl command:

```bash
curl -s --user "$WP_APP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/post_body.json \
  'https://vectormatch.dev/blog/wp-json/wp/v2/posts'
```

The `post_body.json` contains: `title`, `slug`, `content`, `excerpt`, `status`, `date`, `categories`, `tags`, `featured_media`.

### 3.3. Image Upload (replace WPVibe `upload_media`)

WPVibe's `upload_media` downloads an image from a URL and uploads it to WordPress. We can do this with two curl commands:

```bash
# Step 1: Download the image to a temp file
curl -s -o /tmp/blog_image.jpg "https://images.unsplash.com/photo-xxxxx?w=1080"

# Step 2: Upload to WordPress media library via standard REST API
curl -s --user "$WP_APP_USER:$WP_APP_PASSWORD" \
  -H "Content-Disposition: attachment; filename=blog_image.jpg" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/tmp/blog_image.jpg \
  'https://vectormatch.dev/blog/wp-json/wp/v2/media'
# Returns: { "id": 133, "source_url": "https://vectormatch.dev/blog/wp-content/uploads/..." }
```

### 3.4. Image Search (replace WPVibe `search_images`)

WPVibe's `search_images` is a proxy to the Unsplash API. We can call Unsplash directly:

**Option A — Unsplash API (free, 50 requests/hour):**
1. Register at `https://unsplash.com/developers`
2. Create an app to get an Access Key
3. Add to `.env`: `UNSPLASH_ACCESS_KEY=your_key`
4. Search: `curl -s -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY" "https://api.unsplash.com/search/photos?query=tech+chart+dark&per_page=5"`

**Option B — Use `web_search` tool (no API key needed):**
Search for images on the web and extract Unsplash URLs from the results. Less reliable but requires no registration.

**Option C — Skip stock photos entirely:**
The orchestrator prompt already says "Relevance first" and prefers SVG diagrams over stock photos. For most technical posts, inline SVG diagrams are better than generic stock images. The hero image can be a branded SVG cover.

### 3.5. Content Search (replace WPVibe `content/search`)

WPVibe's `content/search` searches inside post content. We can replace this with:

```bash
# Fetch the post content and search locally
curl -s --user "$WP_APP_USER:$WP_APP_PASSWORD" \
  'https://vectormatch.dev/blog/wp-json/wp/v2/posts/133?_fields=content' | \
  python3 -c "import json,sys; content=json.load(sys.stdin)['content']['rendered']; print('Found' if '<details class=\"vm-faq-item\"' in content else 'Not found')"
```

Or simply use `webfetch` on the live post URL and check the rendered HTML (which we already do).

### 3.6. Rank Math SEO Meta (replace WPVibe `run_wp_cli`)

WPVibe's `run_wp_cli` is used to set Rank Math SEO meta fields. We can do this via the standard WP REST API:

```bash
# Set Rank Math SEO meta via REST API
curl -s --user "$WP_APP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{"meta": {"rank_math_title": "SEO Title Here", "rank_math_description": "Meta desc here", "rank_math_focus_keyword": "primary keyword"}}' \
  'https://vectormatch.dev/blog/wp-json/wp/v2/posts/133'
```

Note: This requires Rank Math to register its meta fields as REST-visible (which it does by default in recent versions). If not, we can use the WP REST API meta endpoint or a small custom plugin.

---

## 4. Migration Plan

### Phase 1: Set up persistent credentials (5 minutes)

1. Log into `https://vectormatch.dev/blog/wp-admin/`
2. Go to Users → Your Profile → Application Passwords
3. Create a new application password named `devin-blog-publisher`
4. Add to `.env`:
   ```
   WP_APP_USER=stacionari
   WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
   ```

### Phase 2: Create a publishing script (30 minutes)

Create `docs/wordpress/lib/publish_post.py` — a Python script that:
1. Reads a blog post JSON file
2. Assembles the WordPress post content (lead, TL;DR, takeaways, body, FAQ, conclusion, author)
3. Downloads images from URLs and uploads them to WordPress via REST API
4. Creates the post via REST API
5. Sets Rank Math SEO meta via REST API
6. Verifies the post via HTTP fetch
7. Returns the post ID and URL

```python
#!/usr/bin/env python3
"""Publish a VectorMatch blog post JSON to WordPress via REST API (no WPVibe)."""

import json, os, sys, subprocess, requests

# Config from environment
WP_URL = "https://vectormatch.dev/blog"
WP_USER = os.environ["WP_APP_USER"]
WP_PASS = os.environ["WP_APP_PASSWORD"]

def upload_image(url, alt_text, filename="blog_image.jpg"):
    """Download image from URL and upload to WordPress media library."""
    # Download
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    # Upload
    resp = requests.post(
        f"{WP_URL}/wp-json/wp/v2/media",
        auth=(WP_USER, WP_PASS),
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": r.headers.get("Content-Type", "image/jpeg"),
        },
        data=r.content,
    )
    resp.raise_for_status()
    data = resp.json()
    # Set alt text
    if alt_text:
        requests.post(
            f"{WP_URL}/wp-json/wp/v2/media/{data['id']}",
            auth=(WP_USER, WP_PASS),
            json={"alt_text": alt_text},
        )
    return data["id"], data["source_url"]

def create_post(post_data):
    """Create a WordPress post via REST API."""
    resp = requests.post(
        f"{WP_URL}/wp-json/wp/v2/posts",
        auth=(WP_USER, WP_PASS),
        json=post_data,
    )
    resp.raise_for_status()
    return resp.json()

def set_seo_meta(post_id, seo_title, meta_description, focus_keyword):
    """Set Rank Math SEO meta fields via REST API."""
    meta = {}
    if seo_title:
        meta["rank_math_title"] = seo_title
    if meta_description:
        meta["rank_math_description"] = meta_description
    if focus_keyword:
        meta["rank_math_focus_keyword"] = focus_keyword
    if meta:
        requests.post(
            f"{WP_URL}/wp-json/wp/v2/posts/{post_id}",
            auth=(WP_USER, WP_PASS),
            json={"meta": meta},
        )
```

### Phase 3: Update documentation (15 minutes)

Update these files to remove WPVibe references:
- `docs/wordpress/BlogPostOrchestratorPrompt.md` — replace WPVibe MCP tool references with curl/REST API calls
- `docs/wordpress/wordpress-blog-research-brief.md` — remove WPVibe from plugin list
- `docs/wordpress/WordpressBlogPostTemplate.md` — update publishing workflow section
- `docs/wordpress/BlogPostGenerationPrompt.md` — update references

### Phase 4: Optionally uninstall WPVibe (5 minutes)

Once the publishing script is tested and working:
1. Deactivate WPVibe in wp-admin → Plugins
2. Test publishing one more post without WPVibe active
3. If everything works, delete the WPVibe plugin
4. Reactivate Wordfence (it was kept inactive because it blocks WPVibe auth — without WPVibe, Wordfence can run normally)

### Phase 5: Register for Unsplash API (optional, 5 minutes)

If you want to keep using Unsplash stock photos:
1. Go to `https://unsplash.com/developers`
2. Register and create an app
3. Get the Access Key
4. Add to `.env`: `UNSPLASH_ACCESS_KEY=your_key`

If you prefer to skip stock photos entirely (the orchestrator prompt already recommends SVG diagrams for technical posts), this step is unnecessary.

---

## 5. Benefits of Removing WPVibe

| Benefit | Explanation |
|---|---|
| **No daily usage limits** | WPVibe's free plan caps at ~20 tool calls/day. Direct REST API has no such limit. |
| **No external dependency** | WPVibe is a third-party plugin that could break, have security issues, or change its pricing. |
| **Wordfence can stay active** | Wordfence was kept inactive because it blocks WPVibe authentication. Without WPVibe, Wordfence can run normally, improving security. |
| **Simpler architecture** | One less plugin to maintain, update, and troubleshoot. |
| **Full control** | Direct REST API calls are transparent and debuggable. No black-box middleware. |
| **Faster publishing** | No need to create/delete application passwords per session. One persistent credential. |
| **No MCP server dependency** | Publishing works from any script, CI/CD pipeline, or terminal — not just from Devin sessions with the WPVibe MCP server connected. |

---

## 6. What We Still Need (Minimal Requirements)

| Requirement | How it's met |
|---|---|
| WordPress REST API | Already available at `/blog/wp-json/wp/v2/` (confirmed: returns 200) |
| Application Passwords | Core WordPress feature since 5.6 (confirmed: returns 401 without auth, works with app passwords) |
| Media upload | Standard `POST /wp/v2/media` with multipart form data (confirmed: endpoint exists) |
| Post creation | Standard `POST /wp/v2/posts` (confirmed: we already use this via curl) |
| Image search | Unsplash API (free, 50 req/hr) OR web_search OR SVG diagrams |
| SEO meta | Standard `POST /wp/v2/posts/{id}` with meta fields (Rank Math registers them) |
| Post verification | `webfetch` on live URL (already doing this) |

**No PHP files need to be modified. No database access needed. No WPVibe needed.**
