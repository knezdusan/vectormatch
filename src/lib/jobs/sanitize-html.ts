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
import type { AnyNode, Element } from "domhandler";

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

function isElement(node: AnyNode): node is Element {
  // domhandler marks <script> and <style> as their own node types ("script" and
  // "style"), but they still carry a tagName and attribs and must be treated as
  // elements for sanitization.
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

export function sanitizeJobDescription(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  // Load as a fragment (third argument false) so cheerio does not wrap it in
  // <html><body>. This keeps the returned HTML close to the original input.
  const $ = cheerio.load(html, undefined, false);

  // Walk every element in the fragment.
  $("*").each((_, element) => {
    const node = $(element);

    if (!isElement(element)) {
      return;
    }

    const tagName = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      // Dangerous tags (<script>, <style>, <iframe>, etc.) are removed
      // entirely. For most other forbidden tags we keep the text so that
      // readable content is not lost, but script/style content is never
      // user-facing text.
      if (tagName === "script" || tagName === "style") {
        node.remove();
      } else {
        node.replaceWith(node.text());
      }
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

  return $.html() ?? "";
}
