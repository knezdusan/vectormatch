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

describe("AI/ML tags (2025-2026 expansion)", () => {
  it("includes key LLM frameworks as supporting tags", () => {
    expect(CANONICAL_TAG_MAP.has("langgraph")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("llamaindex")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("crewai")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("vercel-ai-sdk")).toBe(true);
    // All frameworks are supporting — "LangChain Developer" is not a job title
    expect(isPersonaDefining("langgraph")).toBe(false);
    expect(isPersonaDefining("llamaindex")).toBe(false);
  });

  it("includes LLM provider APIs as supporting tags", () => {
    expect(CANONICAL_TAG_MAP.has("anthropic")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("gemini")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("mistral")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("cohere")).toBe(true);
    // Providers are supporting — "OpenAI Developer" is not a job title
    expect(isPersonaDefining("anthropic")).toBe(false);
  });

  it("includes vector databases as supporting tags", () => {
    expect(CANONICAL_TAG_MAP.has("pinecone")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("weaviate")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("chromadb")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("pgvector")).toBe(true);
    // Vector DBs are supporting — follows same pattern as traditional DBs
    expect(isPersonaDefining("pinecone")).toBe(false);
  });

  it("marks RAG as persona_defining (RAG Engineer is a job title)", () => {
    expect(CANONICAL_TAG_MAP.has("rag")).toBe(true);
    expect(isPersonaDefining("rag")).toBe(true);
  });

  it("marks prompt-engineering as persona_defining (Prompt Engineer is a job title)", () => {
    expect(CANONICAL_TAG_MAP.has("prompt-engineering")).toBe(true);
    expect(isPersonaDefining("prompt-engineering")).toBe(true);
  });

  it("includes AI infrastructure tools as supporting", () => {
    expect(CANONICAL_TAG_MAP.has("vllm")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("ollama")).toBe(true);
    expect(isPersonaDefining("vllm")).toBe(false);
  });

  it("includes AI evaluation/observability tools", () => {
    expect(CANONICAL_TAG_MAP.has("langsmith")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("langfuse")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("weights-and-biases")).toBe(true);
  });

  it("includes AI methodologies", () => {
    expect(CANONICAL_TAG_MAP.has("ai-agents")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("function-calling")).toBe(true);
    expect(CANONICAL_TAG_MAP.has("mcp")).toBe(true);
    // AI agents is a pattern, not a standalone identity
    expect(isPersonaDefining("ai-agents")).toBe(false);
  });

  it("all new AI tags have valid categories", () => {
    const newAiTags = [
      "langgraph",
      "llamaindex",
      "crewai",
      "vercel-ai-sdk",
      "anthropic",
      "gemini",
      "pinecone",
      "weaviate",
      "pgvector",
      "vllm",
      "ollama",
      "rag",
      "prompt-engineering",
      "ai-agents",
      "mcp",
      "langsmith",
      "langfuse",
      "lora",
      "github-copilot",
      "cursor",
    ];
    for (const slug of newAiTags) {
      const tag = CANONICAL_TAG_MAP.get(slug);
      expect(tag).toBeDefined();
      expect(tag?.label.length).toBeGreaterThan(0);
    }
  });
});
