// src/lib/jobs/description-formatter.ts
//
// Heuristic job description formatter used for the one-time `descriptionHtml`
// backfill and for runtime fallback rendering when `descriptionHtml` is NULL.
//
// - Extracts the richest available description from legacy `rawJson` (JSON-LD,
//   Greenhouse/Lever/Ashby/SmartRecruiters/Workable/Recruitee shapes) without
//   requiring any external ATS calls.
// - Falls back to `normalizedText` when `rawJson` is gone.
// - Converts plain text into safe, readable HTML: section headers become `<h3>`,
//   blank-line blocks become `<p>`, bullet/numbered lines become `<ul>`/`<ol>`,
//   and fully-collapsed walls of text are split at sentence boundaries.

import { escapeHtml, sanitizeJobDescription } from "@/lib/jobs/sanitize-html";

// Common job-description section headers. Order does not matter for lookups;
// the alternation regex is sorted by length at build time to avoid partial
// false positives (e.g., matching "about" inside "about us").
const SECTION_HEADERS = new Set([
  "about",
  "about us",
  "about the role",
  "about this role",
  "about the company",
  "about the team",
  "company overview",
  "who we are",
  "our company",
  "our story",
  "the challenge",
  "the role",
  "role overview",
  "position overview",
  "job description",
  "description",
  "what you'll do",
  "what youll do",
  "what you will do",
  "responsibilities",
  "key responsibilities",
  "duties",
  "what youll own",
  "what you will own",
  "requirements",
  "required skills",
  "required experience",
  "what we are looking for",
  "who you are",
  "what you bring",
  "qualifications",
  "minimum qualifications",
  "preferred qualifications",
  "skills",
  "experience",
  "before you start",
  "must have",
  "nice to have",
  "preferred",
  "you should have",
  "benefits",
  "perks",
  "what we offer",
  "why us",
  "why join us",
  "why you should apply",
  "ready to help us",
  "how to apply",
  "apply now",
  "our culture",
  "culture",
  "what we value",
  "values",
  "salary",
  "compensation",
  "pay",
  "location",
  "remote",
  "workplace",
]);

const SMARTRECRUITERS_SECTION_NAMES: Record<string, string> = {
  jobDescription: "Job Description",
  qualifications: "Qualifications",
  companyDescription: "About the Company",
  additionalInformation: "Additional Information",
};

function normalizeForHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\w\s'&-]/g, "")
    .trim();
}

function isHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (SECTION_HEADERS.has(normalizeForHeader(trimmed))) return true;
  // ALL-CAPS short heading like "OUR CULTURE"
  if (/^[A-Z][A-Z\s'&-]{2,59}$/.test(trimmed)) return true;
  // Short trailing-colon heading like "Requirements:"
  if (trimmed.endsWith(":") && trimmed.length <= 60) return true;
  return false;
}

function isBullet(line: string): boolean {
  return /^[-*•]\s/.test(line.trim());
}

function isNumbered(line: string): boolean {
  return /^\d+\.\s/.test(line.trim());
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSectionBody(lines: string[]): string {
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return "";

  if (nonEmpty.every(isBullet)) {
    const items = nonEmpty
      .map((l) => l.replace(/^[-*•]\s*/, ""))
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  if (nonEmpty.every(isNumbered)) {
    const items = nonEmpty
      .map((l) => l.replace(/^\d+\.\s*/, ""))
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  }

  const inner = nonEmpty.map(escapeHtml).join("<br>");
  return `<p>${inner}</p>`;
}

function formatStructuredText(text: string): string {
  const blocks = text.split(/\n\s*\n+/);
  const parts: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;

    const lines = trimmed.split("\n").map((l) => l.trim());
    const firstLine = lines[0];

    if (isHeader(firstLine)) {
      parts.push(`<h3>${escapeHtml(firstLine)}</h3>`);
      if (lines.length > 1) {
        parts.push(formatSectionBody(lines.slice(1)));
      }
    } else {
      parts.push(formatSectionBody(lines));
    }
  }

  return parts.join("");
}

function formatBodyAsParagraphs(body: string): string {
  // Split on sentence boundaries: punctuation followed by whitespace and a
  // capital letter, number, or opening quote. This is a cheap heuristic; it
  // will occasionally split after abbreviations, but it reliably breaks the
  // wall-of-text problem for collapsed descriptions.
  const sentences = body
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return "";
  return sentences.map((s) => `<p>${escapeHtml(s)}</p>`).join("");
}

function formatCollapsedText(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // A compact list with no blank lines but bullet/number markers on every line.
  if (lines.length > 1 && lines.every(isBullet)) {
    return formatSectionBody(lines);
  }
  if (lines.length > 1 && lines.every(isNumbered)) {
    return formatSectionBody(lines);
  }

  const sorted = [...SECTION_HEADERS].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(escapeRegex).join("|");
  const headerRegex = new RegExp(`\\b(${pattern})\\b`, "gi");

  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = headerRegex.exec(text);

  while (match !== null) {
    const headerText = match[1];
    const start = match.index;

    if (start > lastIndex) {
      const body = text.slice(lastIndex, start).trim();
      if (body.length > 0) {
        parts.push(formatBodyAsParagraphs(body));
      }
    }

    parts.push(`<h3>${escapeHtml(headerText)}</h3>`);
    lastIndex = headerRegex.lastIndex;
    match = headerRegex.exec(text);
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex).trim();
    if (tail.length > 0) {
      parts.push(formatBodyAsParagraphs(tail));
    }
  }

  // If we only found a stray header with no real body, fall back to plain
  // sentence splitting for the whole text.
  if (parts.length === 1 && parts[0].startsWith("<h3>")) {
    return formatBodyAsParagraphs(text);
  }

  return parts.join("");
}

function formatPlainTextDescription(text: string): string {
  let t = text.replace(/\r\n/g, "\n");

  // Recover literal \n that may have been double-escaped in raw JSON strings.
  if (!t.includes("\n") && t.includes("\\n")) {
    t = t.replace(/\\n/g, "\n");
  }

  t = t.trim();
  if (t.length === 0) return "";

  if (/\n\s*\n/.test(t)) {
    return formatStructuredText(t);
  }

  return formatCollapsedText(t);
}

function looksLikeHtml(text: string): boolean {
  return /<[a-zA-Z][\s\S]*?>/.test(text);
}

function formatDescriptionString(raw: string, isHtml: boolean): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if ((isHtml || looksLikeHtml(trimmed)) && looksLikeHtml(trimmed)) {
    const sanitized = sanitizeJobDescription(trimmed);
    const textOnly = sanitized.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
    return textOnly.length > 0 ? sanitized : null;
  }

  const html = formatPlainTextDescription(trimmed);
  const textOnly = html.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  return textOnly.length > 0 ? html : null;
}

function extractSmartrecruitersSectionsHtml(
  obj: Record<string, unknown>,
): string | null {
  const jobAd = obj.jobAd;
  if (typeof jobAd !== "object" || jobAd === null) return null;

  const sections = (jobAd as Record<string, unknown>).sections;
  if (typeof sections !== "object" || sections === null) return null;

  const parts: string[] = [];
  for (const [key, section] of Object.entries(
    sections as Record<string, unknown>,
  )) {
    if (typeof section !== "object" || section === null) continue;
    const text = (section as Record<string, unknown>).text;
    if (typeof text !== "string" || text.trim().length === 0) continue;

    const displayName =
      SMARTRECRUITERS_SECTION_NAMES[key] ??
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/^\s/, "")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    parts.push(`<h3>${escapeHtml(displayName)}</h3>`);
    parts.push(sanitizeJobDescription(text));
  }

  return parts.length > 0 ? parts.join("") : null;
}

function extractLeverListsHtml(obj: Record<string, unknown>): string | null {
  if (!Array.isArray(obj.lists)) return null;

  const parts: string[] = [];
  for (const item of obj.lists) {
    if (typeof item !== "object" || item === null) continue;
    const list = item as Record<string, unknown>;
    const text = typeof list.text === "string" ? list.text : "";
    const content = typeof list.content === "string" ? list.content : "";

    if (text) parts.push(`<h3>${escapeHtml(text)}</h3>`);
    if (content) parts.push(sanitizeJobDescription(content));
  }

  return parts.length > 0 ? parts.join("") : null;
}

function extractJsonLdDescription(obj: Record<string, unknown>): string | null {
  if (
    obj["@context"] !== "https://schema.org" ||
    obj["@type"] !== "JobPosting"
  ) {
    return null;
  }

  const desc = obj.description;
  if (typeof desc === "string" && desc.trim().length > 0) {
    return desc;
  }

  return null;
}

/**
 * Regex-based fallback for extracting the `description` field from a JSON-LD
 * JobPosting string that contains literal (unescaped) control characters,
 * which make `JSON.parse` fail. This handles the case where a legacy normalizer
 * stored the raw JSON-LD blob (with embedded newlines) as `normalizedText`.
 */
function extractJsonLdDescriptionRegex(text: string): string | null {
  if (!text.includes('"@type"') || !text.includes('"description"')) {
    return null;
  }

  // Match "description":"..." — the value extends to the next unescaped quote
  // followed by a comma or closing brace. Literal newlines inside the value
  // are preserved.
  const match = text.match(/"description"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (!match || !match[1]) return null;

  // Unescape JSON string escapes: \n → newline, \t → tab, \" → quote, \\ → backslash
  const desc = match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  return desc.trim().length > 0 ? desc : null;
}

function extractBestDescription(
  rawJson: string,
  atsSource: string | null,
): { raw: string; isHtml: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // JSON.parse failed — likely due to literal control characters in string
    // values (a legacy normalizer issue). Try a regex-based extraction for
    // JSON-LD JobPosting descriptions before giving up.
    const regexDesc = extractJsonLdDescriptionRegex(rawJson);
    if (regexDesc) {
      return { raw: regexDesc, isHtml: false };
    }
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;

  // JSON-LD (e.g., scraped <script type="application/ld+json">).
  const jsonLd = extractJsonLdDescription(obj);
  if (jsonLd) {
    return { raw: jsonLd, isHtml: false };
  }

  // Some payloads are arrays of schema.org objects.
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object" && item !== null) {
        const ld = extractJsonLdDescription(item as Record<string, unknown>);
        if (ld) return { raw: ld, isHtml: false };
      }
    }
    return null;
  }

  switch (atsSource) {
    case "greenhouse": {
      const raw = typeof obj.content === "string" ? obj.content : "";
      return raw ? { raw, isHtml: true } : null;
    }
    case "lever": {
      const htmlDesc =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      const plainDesc =
        typeof obj.descriptionPlain === "string" &&
        obj.descriptionPlain.length > 0
          ? obj.descriptionPlain
          : "";
      const raw = htmlDesc || plainDesc;
      if (!raw) return null;

      const listsHtml = extractLeverListsHtml(obj);
      if (listsHtml) {
        return { raw: `<div>${raw}</div>${listsHtml}`, isHtml: true };
      }

      return { raw, isHtml: Boolean(htmlDesc) };
    }
    case "ashby": {
      const html =
        typeof obj.descriptionHtml === "string" &&
        obj.descriptionHtml.length > 0
          ? obj.descriptionHtml
          : "";
      const plain =
        typeof obj.descriptionPlain === "string" &&
        obj.descriptionPlain.length > 0
          ? obj.descriptionPlain
          : "";
      if (html) return { raw: html, isHtml: true };
      if (plain) return { raw: plain, isHtml: false };
      return null;
    }
    case "smartrecruiters": {
      const sectionsHtml = extractSmartrecruitersSectionsHtml(obj);
      return sectionsHtml ? { raw: sectionsHtml, isHtml: true } : null;
    }
    case "workable": {
      const raw =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      return raw ? { raw, isHtml: true } : null;
    }
    case "recruitee": {
      const desc =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      const req =
        typeof obj.requirements === "string" && obj.requirements.length > 0
          ? obj.requirements
          : "";
      const raw = [desc, req].filter(Boolean).join("\n\n");
      return raw ? { raw, isHtml: false } : null;
    }
    default: {
      const candidates: [string, boolean][] = [
        ["descriptionHtml", true],
        ["description", false],
        ["content", false],
        ["descriptionPlain", false],
        ["jobDescription", false],
        ["requirements", false],
        ["responsibilities", false],
      ];
      for (const [key, isHtml] of candidates) {
        const value = obj[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return { raw: value, isHtml };
        }
      }
      return null;
    }
  }
}

export type FormatDescriptionInput = {
  rawJson?: string | null;
  normalizedText?: string | null;
  atsSource?: string | null;
};

/**
 * Build the best candidate-facing HTML from whatever data is still available.
 * Returns `null` when no usable description could be extracted.
 */
export function formatDescriptionHtml(
  input: FormatDescriptionInput,
): string | null {
  const atsSource = input.atsSource ?? null;

  if (input.rawJson) {
    const fromRaw = extractBestDescription(input.rawJson, atsSource);
    if (fromRaw) {
      const html = formatDescriptionString(fromRaw.raw, fromRaw.isHtml);
      if (html) return html;
    }
  }

  if (input.normalizedText) {
    // Some legacy normalizers stored the raw JSON-LD blob as normalizedText
    // instead of extracting the description field. Try to parse it as JSON-LD
    // before falling back to plain-text formatting.
    const trimmed = input.normalizedText.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"@type"')) {
      const fromNorm = extractBestDescription(trimmed, atsSource);
      if (fromNorm) {
        const html = formatDescriptionString(fromNorm.raw, fromNorm.isHtml);
        if (html) return html;
      }
    }

    return formatDescriptionString(input.normalizedText, false);
  }

  return null;
}
