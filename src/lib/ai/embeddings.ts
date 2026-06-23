// Embedding Generation Utility
// src/lib/ai/embeddings.ts
//
// Shared AI SDK utilities (embeddings now; prompt builders, model configs
// later). Promoted from src/lib/onboarding/embeddings.ts per
// MODULE_C_DECISIONS.md §9 — Module C is not "onboarding," and importing
// embedding utilities from the onboarding module is a boundary smell that
// worsens as Module D also needs embeddings.
//
// Wraps the Vercel AI SDK `embedMany` call for OpenAI's text-embedding-3-small
// model (1536 dimensions). Used by:
//   - finalizeOnboardingAction — to embed each persona's embeddingSummary
//   - recomputeTagsExperience   — to regenerate persona embeddings when
//     mustHaveTags change (MODULE_A_DECISIONS.md §12)
//   - Module C job-embedder     — to embed job title + cleaned description
//     (must use the same model so persona + job vectors share an embedding
//     space for Gate 2 HNSW cosine similarity)
//
// Server-only: this module touches the OpenAI API and must never run in the
// browser. It is imported exclusively by Server Actions / server utilities.

import "server-only";

import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

/**
 * Generate embeddings using text-embedding-3-small (1536 dimensions).
 * Returns an array of number[], one per input text, in input order.
 *
 * Empty input returns an empty array without calling the API.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: texts,
  });

  return embeddings;
}

/**
 * Generate a single embedding. Convenience wrapper around generateEmbeddings
 * for the common one-persona regeneration case in recomputeTagsExperience.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  if (!embedding) {
    throw new Error("Failed to generate embedding: empty result from provider");
  }
  return embedding;
}
