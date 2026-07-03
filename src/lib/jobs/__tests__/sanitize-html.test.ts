import { describe, expect, it } from "vitest";
import { sanitizeJobDescription } from "@/lib/jobs/sanitize-html";

describe("sanitizeJobDescription", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeJobDescription("")).toBe("");
    expect(sanitizeJobDescription(null as unknown as string)).toBe("");
  });

  it("preserves basic formatting tags", () => {
    const html =
      "<p>Build <strong>scalable</strong> systems with <em>React</em>.</p>";
    expect(sanitizeJobDescription(html)).toBe(html);
  });

  it("removes script tags and event handlers", () => {
    const html =
      '<p>Hello</p><script>alert("xss")</script><a href="/jobs" onclick="alert(1)">link</a>';
    const sanitized = sanitizeJobDescription(html);
    expect(sanitized).toContain("<p>Hello</p>");
    expect(sanitized).toContain('<a href="/jobs">link</a>');
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("onclick");
  });

  it("removes javascript: URLs", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeJobDescription(html)).toBe("<a>click</a>");
  });

  it("keeps list markup", () => {
    const html = "<ul><li>React</li><li>Next.js</li></ul>";
    expect(sanitizeJobDescription(html)).toBe(html);
  });

  it("replaces forbidden tags with text content", () => {
    const html = "<style>body { color: red; }</style><p>Hello</p>";
    expect(sanitizeJobDescription(html)).toBe("<p>Hello</p>");
  });
});
