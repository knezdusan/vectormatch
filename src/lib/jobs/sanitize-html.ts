// src/lib/jobs/sanitize-html.ts
//
// Minimal HTML sanitizer for job descriptions rendered in the dashboard.
// Uses cheerio (already in the project dependency tree) to strip dangerous
// tags/attributes while preserving the basic formatting ATS boards commonly
// emit: <p>, <strong>, <em>, <br>, <ul>, <li>, <a>, etc.
//
// The input is always from a known ATS API response, but sanitizing before
// injecting into the DOM is a cheap defensive layer.

import * as cheerio from "cheerio";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "blockquote",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

const FORBIDDEN_URL_SCHEMES = /^\s*(javascript|data|vbscript):/i;

export function sanitizeJobDescription(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const $ = cheerio.load(html, {
    // Don't add <html>/<body> wrappers; keep the fragment as-is.
    _useHtmlParser2: true,
  });

  // Walk every element in the fragment.
  $("*").each((_, element) => {
    const node = $(element);
    const tagName = element.tagName?.toLowerCase() ?? "";

    if (!ALLOWED_TAGS.has(tagName)) {
      // Replace forbidden tags with their text content. This keeps the
      // readable text without rendering the tag (e.g. <script>).
      node.replaceWith(node.text());
      return;
    }

    // Strip disallowed attributes and dangerous URLs.
    const attributes = element.attribs;
    const allowed = ALLOWED_ATTRIBUTES[tagName] ?? new Set();
    for (const name of Object.keys(attributes)) {
      const lowerName = name.toLowerCase();
      if (!allowed.has(lowerName)) {
        node.removeAttr(name);
        continue;
      }
      if (lowerName === "href") {
        const value = attributes[name] ?? "";
        if (FORBIDDEN_URL_SCHEMES.test(value)) {
          node.removeAttr(name);
        }
      }
    }
  });

  // cheerio.load with a fragment returns a document with the content inside
  // <html><head></head><body>...</body></html>. We extract the body content.
  return $("body").html() ?? "";
}
