#!/usr/bin/env python3
"""Publish a VectorMatch blog post JSON to WordPress via REST API (no WPVibe).

Usage:
    python3 docs/wordpress/lib/publish_post.py <post.json>

The script:
1. Parses the blog post JSON (matching the BlogPostGenerationPrompt schema).
2. Assembles the WordPress post content (lead, TL;DR, takeaways, body, FAQ, conclusion, author).
3. Downloads images from URLs and uploads them to the WordPress media library.
4. Creates the post via the WordPress REST API.
5. Sets Rank Math SEO meta fields.
6. Prints the post ID, URL, and a summary.

Requires the following environment variables (from .env):
    WP_API_URL     — e.g. https://vectormatch.dev/blog/wp-json/wp/v2
    WP_APP_USER    — WordPress username
    WP_APP_PASSWORD — Application password (spaces are fine)

Image handling:
- Images with a candidate_url or a URL in the images array are downloaded and uploaded.
- Images without a URL are skipped (the [[IMAGE:id]] marker is removed from content).
- The hero image (role "hero") is set as the featured image.

Unsplash search (optional):
- If UNSPLASH_ACCESS_KEY is set, images with suggested_search_query but no URL
  will be searched on Unsplash and the first result uploaded.
- Without UNSPLASH_ACCESS_KEY, such images are skipped.
"""

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

# Add the lib directory to path for faq_component
sys.path.insert(0, str(Path(__file__).resolve().parent))
from faq_component import render_faq  # noqa: E402

# ─── Configuration ───────────────────────────────────────────────────────────

WP_API_URL = os.environ.get("WP_API_URL", "https://vectormatch.dev/blog/wp-json/wp/v2")
WP_USER = os.environ.get("WP_APP_USER", "")
WP_PASS = os.environ.get("WP_APP_PASSWORD", "")
UNSPLASH_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")

AUTH = (WP_USER, WP_PASS)
TIMEOUT = 30

# Tag name → ID mapping (from the WordPress blog)
TAG_MAP = {
    "React": 8, "Next.js": 9, "TypeScript": 10, "Tailwind CSS": 11,
    "GraphQL": 12, "Node.js": 13, "Vue": 14, "Angular": 15,
    "PHP": 16, "Laravel": 17, "Python": 18, "Greenhouse": 19,
    "Lever": 20, "Ashby": 21, "Workday": 22, "SmartRecruiters": 23,
    "ATS": 24, "LinkedIn": 25, "Resume": 26, "Cover Letter": 27,
    "Interviews": 28, "Salary": 29, "Remote": 30, "Freelance": 31,
    "B2B": 32, "Work Authorization": 33, "AI": 34, "Networking": 35,
    "Portfolio": 36, "Skills": 37, "Seniority": 38,
}

# Category name → ID mapping
CATEGORY_MAP = {
    "ATS & Hiring Systems": 2,
    "Job Search Strategy": 3,
    "Remote & Global Work": 4,
    "Developer Career Growth": 5,
    "Market Intelligence": 6,
    "Product & Engineering": 7,
}


# ─── Image handling ──────────────────────────────────────────────────────────

def search_unsplash(query: str, count: int = 5):
    """Search Unsplash for images. Returns the first result or None."""
    if not UNSPLASH_KEY:
        return None
    resp = requests.get(
        "https://api.unsplash.com/search/photos",
        headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"},
        params={"query": query, "per_page": count, "orientation": "landscape"},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return None
    photo = results[0]
    return {
        "url": photo["urls"]["regular"],
        "alt": photo.get("alt_description") or photo.get("description") or query,
        "photographer": photo["user"]["name"],
    }


def upload_image_to_wp(image_url: str, alt_text: str = "", caption: str = ""):
    """Download an image from a URL and upload it to the WordPress media library.

    Returns {"id": int, "source_url": str}.
    """
    # Download the image
    resp = requests.get(image_url, timeout=TIMEOUT)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg")

    # Determine filename from URL
    parsed = urlparse(image_url)
    filename = os.path.basename(parsed.path) or "blog_image.jpg"
    if not filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        filename += ".jpg"

    # Upload to WordPress
    upload_resp = requests.post(
        f"{WP_API_URL}/media",
        auth=AUTH,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": content_type,
        },
        data=resp.content,
        timeout=TIMEOUT,
    )
    upload_resp.raise_for_status()
    data = upload_resp.json()
    media_id = data["id"]
    source_url = data["source_url"]

    # Set alt text and caption
    update_data = {}
    if alt_text:
        update_data["alt_text"] = alt_text
    if caption:
        update_data["caption"] = caption
    if update_data:
        requests.post(
            f"{WP_API_URL}/media/{media_id}",
            auth=AUTH,
            json=update_data,
            timeout=TIMEOUT,
        )

    return {"id": media_id, "source_url": source_url}


def process_images(images):
    """Process all images in the JSON. Returns a mapping of image id → {id, source_url}.

    For each image:
    1. If it has a candidate_url, download and upload it.
    2. If it has a suggested_search_query and UNSPLASH_ACCESS_KEY is set, search Unsplash.
    3. Otherwise, skip it (the marker will be removed from content).
    """
    results = {}
    for img in images:
        img_id = img["id"]
        alt_text = img.get("alt_text", "")
        caption = img.get("caption", "")

        # Try candidate_url first
        url = img.get("candidate_url")
        if url and img.get("url_verified", False):
            try:
                print(f"  Uploading image '{img_id}' from candidate_url...")
                results[img_id] = upload_image_to_wp(url, alt_text, caption)
                print(f"    → media ID {results[img_id]['id']}")
                continue
            except Exception as e:
                print(f"    ⚠ Failed to upload from candidate_url: {e}")

        # Try Unsplash search
        query = img.get("suggested_search_query")
        if query and UNSPLASH_KEY:
            try:
                print(f"  Searching Unsplash for '{query}'...")
                photo = search_unsplash(query)
                if photo:
                    print(f"    → Found: {photo['photographer']}")
                    results[img_id] = upload_image_to_wp(photo["url"], alt_text, caption)
                    print(f"    → media ID {results[img_id]['id']}")
                    continue
            except Exception as e:
                print(f"    ⚠ Unsplash search failed: {e}")

        print(f"  Skipping image '{img_id}' (no URL or Unsplash unavailable)")
    return results


# ─── Content assembly ────────────────────────────────────────────────────────

def strip_html_tags(text: str) -> str:
    """Remove HTML tags from text."""
    return re.sub(r"<[^>]+>", "", text)


def assemble_content(data, image_map):
    """Assemble the full WordPress post content HTML."""
    hero = data.get("hero", {})
    meta = data.get("meta", {})

    # 1. Lead paragraph
    lead = f'<p class="vm-lead">{hero.get("subtitle", "")}</p>'

    # 2. TL;DR callout
    direct_answer = hero.get("direct_answer", "")
    tldr = (
        '<div class="vm-tldr">'
        '<p class="vm-tldr-label">'
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round" style="width:.9rem;height:.9rem;">'
        '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
        "The short answer</p>"
        f"<p>{direct_answer}</p>"
        "</div>"
    )

    # 3. Key takeaways
    takeaways_list = data.get("key_takeaways", [])
    takeaways_html = "".join(f"<li>{t}</li>" for t in takeaways_list)
    takeaways = (
        '<div class="vm-takeaways"><p class="vm-h">What you’ll learn</p>'
        f"<ul>{takeaways_html}</ul></div>"
    )

    # 4. Content body with markers replaced
    content = data.get("content_html", "")
    ctas = {c["id"]: c for c in data.get("cta_blocks", [])}
    images = {img["id"]: img for img in data.get("images", [])}

    # Replace CTA markers
    for cid, cta in ctas.items():
        marker = f"[[CTA:{cid}]]"
        # Handle both bare and <p>-wrapped markers
        cta_html = f'<div class="vm-cta"><a href="{cta["url"]}" class="btn-brand">{cta["copy"]}</a></div>'
        content = content.replace(f"<p>{marker}</p>", cta_html)
        content = content.replace(marker, cta_html)

    # Replace image markers
    for img_id, img in images.items():
        marker = f"[[IMAGE:{img_id}]]"
        if img_id in image_map:
            uploaded = image_map[img_id]
            figure_html = (
                f'<figure class="vm-figure">'
                f'<img src="{uploaded["source_url"]}" alt="{img.get("alt_text", "")}" loading="lazy">'
                f'<figcaption>{img.get("caption", "")}</figcaption>'
                f"</figure>"
            )
            content = content.replace(f"<p>{marker}</p>", figure_html)
            content = content.replace(marker, figure_html)
        else:
            # Remove the marker if no image was uploaded
            content = content.replace(f"<p>{marker}</p>", "")
            content = content.replace(marker, "")

    # Cleanup: remove any remaining [[IMAGE:...]] markers that didn't match any image id
    content = re.sub(r"<p>\[\[IMAGE:[^\]]+\]\]</p>", "", content)
    content = re.sub(r"\[\[IMAGE:[^\]]+\]\]", "", content)

    # 5. FAQ section
    faq_html = render_faq(data.get("faq", []))

    # 6. Conclusion
    conclusion = data.get("conclusion", {})
    summary_html = conclusion.get("summary_html", "")
    closing_cta_id = conclusion.get("closing_cta_id", "closing")
    closing_cta = ctas.get(closing_cta_id, {})
    closing_html = ""
    if closing_cta:
        closing_html = f'<div class="vm-cta"><a href="{closing_cta["url"]}" class="btn-brand">{closing_cta["copy"]}</a></div>'
    conclusion_html = summary_html + closing_html

    # 7. Author box
    author = data.get("author_box", {})
    author_html = (
        f'<div class="vm-author-box">'
        f'<p><strong>{author.get("byline", "VectorMatch Team")}</strong></p>'
        f'{author.get("html", "")}'
        f"</div>"
    )

    # Assemble in order
    full_content = lead + tldr + takeaways + content + faq_html + conclusion_html + author_html
    return full_content


# ─── Post creation ───────────────────────────────────────────────────────────

def resolve_category(category_name):
    """Map a category name to its WordPress ID."""
    return CATEGORY_MAP.get(category_name, 6)  # default to Market Intelligence


def resolve_tags(tag_names):
    """Map tag names to WordPress IDs. Skips unknown tags."""
    ids = []
    for name in tag_names:
        # Skip category names used as tags
        if name in CATEGORY_MAP:
            continue
        tag_id = TAG_MAP.get(name)
        if tag_id:
            ids.append(tag_id)
    # Ensure at least 2 tags
    if len(ids) < 2:
        ids.extend([35, 36])  # Networking, Portfolio as defaults
    return ids[:5]  # max 5 tags


def create_post(post_data):
    """Create a WordPress post via REST API. Returns the response JSON."""
    resp = requests.post(
        f"{WP_API_URL}/posts",
        auth=AUTH,
        json=post_data,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def set_seo_meta(post_id, meta):
    """Set Rank Math SEO meta fields via REST API."""
    updates = {}
    if meta.get("seo_title"):
        updates["rank_math_title"] = meta["seo_title"]
    if meta.get("meta_description"):
        updates["rank_math_description"] = meta["meta_description"]
    if meta.get("primary_keyword"):
        updates["rank_math_focus_keyword"] = meta["primary_keyword"]
    if updates:
        try:
            requests.post(
                f"{WP_API_URL}/posts/{post_id}",
                auth=AUTH,
                json={"meta": updates},
                timeout=TIMEOUT,
            )
            print(f"  SEO meta set: {list(updates.keys())}")
        except Exception as e:
            print(f"  ⚠ Failed to set SEO meta: {e}")


def verify_post(url):
    """Fetch the live post URL and verify it returns 200."""
    try:
        resp = requests.get(url, timeout=TIMEOUT, allow_redirects=True)
        return resp.status_code == 200
    except Exception:
        return False


# ─── Main ────────────────────────────────────────────────────────────────────

def publish(json_path, publish_date=None):
    """Publish a blog post JSON file to WordPress. Returns a summary dict.

    Args:
        json_path: Path to the blog post JSON file.
        publish_date: ISO 8601 date string (e.g. "2026-07-20T11:00:00") for the
            post's publish date. If None, defaults to today at 12:00 UTC.
            Always pass an explicit date for backdating (see BlogPostOrchestratorPrompt STEP 5).
    """
    # Load JSON
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    meta = data.get("meta", {})
    print(f"\n{'='*60}")
    print(f"Publishing: {meta.get('title', 'Untitled')}")
    print(f"{'='*60}")

    # Process images
    print("\n📸 Processing images...")
    images = data.get("images", [])
    image_map = process_images(images)

    # Find hero image ID
    hero_media_id = None
    for img in images:
        if img.get("role") == "hero" and img["id"] in image_map:
            hero_media_id = image_map[img["id"]]["id"]
            break

    # Assemble content
    print("\n📝 Assembling content...")
    content = assemble_content(data, image_map)
    print(f"  Content length: {len(content)} chars")

    # Determine publish date
    if not publish_date:
        from datetime import datetime, timezone
        publish_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT12:00:00")
        print(f"\n⚠ No --date provided, defaulting to today: {publish_date}")
        print("  For backdating, always pass --date \"YYYY-MM-DDTHH:00:00\"")
    print(f"\n📅 Publish date: {publish_date}")

    # Build post data
    post_data = {
        "title": meta.get("title", ""),
        "slug": meta.get("slug", ""),
        "content": content,
        "excerpt": meta.get("meta_description", ""),
        "status": "publish",
        "date": publish_date,
        "date_gmt": publish_date,
        "categories": [resolve_category(meta.get("category", "Market Intelligence"))],
        "tags": resolve_tags(meta.get("tags", [])),
    }
    if hero_media_id:
        post_data["featured_media"] = hero_media_id

    # Create post
    print("\n🚀 Creating post...")
    result = create_post(post_data)
    post_id = result["id"]
    post_url = result.get("link", "")
    print(f"  Post ID: {post_id}")
    print(f"  URL: {post_url}")
    print(f"  Status: {result.get('status', 'unknown')}")

    # Set SEO meta
    print("\n🔍 Setting SEO meta...")
    set_seo_meta(post_id, meta)

    # Verify
    print("\n✅ Verifying post...")
    if verify_post(post_url):
        print(f"  Live at {post_url} ✓")
    else:
        print(f"  ⚠ Could not verify (may still be publishing)")

    # Summary
    summary = {
        "post_id": post_id,
        "url": post_url,
        "status": result.get("status"),
        "slug": result.get("slug"),
        "category": meta.get("category"),
        "tags": meta.get("tags"),
        "featured_media": hero_media_id,
        "images_uploaded": len(image_map),
        "images_skipped": len(images) - len(image_map),
    }

    print(f"\n{'='*60}")
    print(f"PUBLISHED: {meta.get('title')}")
    print(f"URL: {post_url}")
    print(f"ID: {post_id}")
    print(f"Images: {len(image_map)} uploaded, {len(images) - len(image_map)} skipped")
    print(f"{'='*60}\n")

    return summary


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Publish a VectorMatch blog post JSON to WordPress.")
    parser.add_argument("json_path", help="Path to the blog post JSON file")
    parser.add_argument("--date", default=None,
                        help='Publish date in ISO 8601 format (e.g. "2026-07-20T11:00:00"). '
                             'If omitted, defaults to today at 12:00 UTC. '
                             'Always pass --date for backdating (see BlogPostOrchestratorPrompt STEP 5).')
    args = parser.parse_args()

    if not WP_USER or not WP_PASS:
        print("Error: WP_APP_USER and WP_APP_PASSWORD must be set in environment.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.json_path):
        print(f"Error: File not found: {args.json_path}", file=sys.stderr)
        sys.exit(1)

    summary = publish(args.json_path, publish_date=args.date)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
