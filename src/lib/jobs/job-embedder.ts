// Module C — Job Embedder (Step 1b of the 3-Gate Funnel)
// src/lib/jobs/job-embedder.ts
//
// Generates the job embedding (text-embedding-3-small, 1536-d) from the
// cleaned fullText (title + stripped description). The embedding is stored in
// job.jobEmbedding and used by Gate 2 (HNSW cosine similarity against persona
// embeddings).
//
// CRITICAL: must use the same model as persona embeddings (text-embedding-3-
// small) — Gate 2 only works if both vectors are in the same embedding space.
// This is guaranteed by Module A using the same promoted utility.
// (MODULE_C_DECISIONS.md §4.4)
//
// Server-only: touches the OpenAI API. Imported lazily inside the Inngest
// handler (AGENTS.md rule 2 — lazy imports).

import "server-only";

import { generateEmbedding } from "@/lib/ai/embeddings";

/**
 * Generate a job embedding from the cleaned fullText (title + description).
 *
 * The fullText is produced by extractJobContent() in job-normalizer.ts —
 * HTML is already stripped, entities decoded, whitespace collapsed. This
 * function is a thin wrapper around the shared generateEmbedding utility
 * (promoted from onboarding to src/lib/ai/embeddings.ts per §9).
 *
 * @param fullText  The cleaned job text (title + " " + description)
 * @returns         A 1536-dimensional number[] suitable for the
 *                  `vector(1536)` column job.jobEmbedding.
 */
export async function embedJob(fullText: string): Promise<number[]> {
  return generateEmbedding(fullText);
}
