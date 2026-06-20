/**
 * Unit tests for the CANONICAL_TAGS taxonomy integrity.
 *
 * Verifies the invariants documented in MODULE_A_IMPLEMENTATION_HANDOFF.md §10:
 *   - All tags have unique slugs
 *   - All tags have non-empty labels
 *   - PERSONA_DEFINING_TAGS contains only persona_defining tags
 *   - CANONICAL_TAG_MAP has the same size as CANONICAL_TAGS
 *   - normalizeToCanonicalTag returns correct slug for known tag, null for unknown
 *   - isPersonaDefining returns true for react, false for css
 */

import {
  CANONICAL_TAG_MAP,
  CANONICAL_TAG_SLUGS,
  CANONICAL_TAGS,
  isPersonaDefining,
  normalizeToCanonicalTag,
  PERSONA_DEFINING_TAGS,
} from "@/lib/jobs/tech-tags";

describe("CANONICAL_TAGS integrity", () => {
  it("all tags have unique slugs", () => {
    const slugs = CANONICAL_TAGS.map((t) => t.tag);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it("all tags have non-empty labels", () => {
    for (const tag of CANONICAL_TAGS) {
      expect(tag.label.length).toBeGreaterThan(0);
    }
  });

  it("all tag slugs are lowercase", () => {
    for (const tag of CANONICAL_TAGS) {
      expect(tag.tag).toBe(tag.tag.toLowerCase());
    }
  });

  it("all tags have a valid classification", () => {
    for (const tag of CANONICAL_TAGS) {
      expect(["persona_defining", "supporting"]).toContain(tag.classification);
    }
  });

  it("all tags have a valid category", () => {
    const validCategories = [
      "language",
      "frontend",
      "backend",
      "database",
      "devops",
      "library",
      "mobile",
      "methodology",
    ];
    for (const tag of CANONICAL_TAGS) {
      expect(validCategories).toContain(tag.category);
    }
  });
});

describe("PERSONA_DEFINING_TAGS", () => {
  it("contains only tags with classification === persona_defining", () => {
    for (const tag of CANONICAL_TAGS) {
      const inSet = PERSONA_DEFINING_TAGS.has(tag.tag);
      const isDefining = tag.classification === "persona_defining";
      expect(inSet).toBe(isDefining);
    }
  });

  it("is non-empty", () => {
    expect(PERSONA_DEFINING_TAGS.size).toBeGreaterThan(0);
  });
});

describe("CANONICAL_TAG_MAP", () => {
  it("has the same size as CANONICAL_TAGS", () => {
    expect(CANONICAL_TAG_MAP.size).toBe(CANONICAL_TAGS.length);
  });

  it("CANONICAL_TAG_SLUGS has the same size as CANONICAL_TAGS", () => {
    expect(CANONICAL_TAG_SLUGS.size).toBe(CANONICAL_TAGS.length);
  });
});

describe("normalizeToCanonicalTag", () => {
  it("returns the correct slug for a known tag", () => {
    expect(normalizeToCanonicalTag("react")).toBe("react");
  });

  it("returns the correct slug for a known tag regardless of case", () => {
    expect(normalizeToCanonicalTag("REACT")).toBe("react");
    expect(normalizeToCanonicalTag("React")).toBe("react");
  });

  it("trims whitespace before lookup", () => {
    expect(normalizeToCanonicalTag("  react  ")).toBe("react");
  });

  it("returns null for an unknown tag", () => {
    expect(normalizeToCanonicalTag("nonexistent-tag-xyz")).toBeNull();
  });
});

describe("isPersonaDefining", () => {
  it("returns true for react (persona_defining)", () => {
    expect(isPersonaDefining("react")).toBe(true);
  });

  it("returns false for css (supporting)", () => {
    expect(isPersonaDefining("css")).toBe(false);
  });

  it("returns false for an unknown tag", () => {
    expect(isPersonaDefining("nonexistent-tag-xyz")).toBe(false);
  });

  it("returns true for nextjs (persona_defining per decision §1)", () => {
    expect(isPersonaDefining("nextjs")).toBe(true);
  });

  it("returns true for kubernetes (persona_defining per decision §1)", () => {
    expect(isPersonaDefining("kubernetes")).toBe(true);
  });

  it("returns false for terraform (supporting per decision §1)", () => {
    expect(isPersonaDefining("terraform")).toBe(false);
  });
});
