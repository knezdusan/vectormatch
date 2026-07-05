// Batch LLM Client — OpenAI Batch API Wrapper
// src/lib/jobs/batch-llm-client.ts
//
// Thin wrapper for the OpenAI Batch API, used for SLA-indifferent LLM paths
// (content-drift re-normalization, dormant-tier first-time normalization,
// sweeper-discarded job recovery, bulk backlog catch-up).
//
// The sync path (remote-scope-extractor.ts) uses @ai-sdk/openai +
// generateObject for SLA-critical first-time normalization inside the 4hr
// provisional window. The batch path uses this wrapper for 50% cost discount
// at the cost of up to 24hr turnaround.
//
// Created in Phase 2 but NOT wired into the normalizer until Phase 3 when
// batch-eligible paths exist (content-drift re-normalization). This file
// exists now so Phase 3 can import it without creating new infrastructure.
//
// See governing doc "Implementation Decisions" → "OpenAI Batch API".

import "server-only";

import OpenAI from "openai";

// =============================================================================
// TYPES
// =============================================================================

/** Input for a single job in a batch request. */
export interface BatchLlmInput {
  /** Unique identifier for this job within the batch (the job ID). */
  customId: string;
  /** The cleaned JD text to classify. */
  text: string;
}

/** Result for a single job from a completed batch. */
export interface BatchLlmResult {
  /** The custom ID from the input. */
  customId: string;
  /** The parsed structured output, or null if the job failed. */
  output: {
    remoteScope: string;
    allowedCountries: string[] | null;
    workAuthRequired: boolean;
    confidence: number;
  } | null;
  /** Error message if the job failed. */
  error: string | null;
  /** Status from the Batch API: "completed" | "failed" | "expired". */
  status: string;
}

/** Status of a batch submission. */
export type BatchStatus =
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired";

export interface BatchSubmission {
  /** The OpenAI batch ID. */
  batchId: string;
  /** Status at time of check. */
  status: BatchStatus;
  /** Number of requests in the batch. */
  requestCount: number;
  /** When the batch was created (ISO string). */
  createdAt: string;
  /** When the batch will expire (ISO string). */
  expiresAt: string;
}

// =============================================================================
// CLIENT
// =============================================================================

/**
 * Lazy-initialized OpenAI client. Uses the OPENAI_API_KEY environment
 * variable (same key used by @ai-sdk/openai for the sync path).
 */
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client === null) {
    _client = new OpenAI();
  }
  return _client;
}

// =============================================================================
// SYSTEM PROMPT (mirrors remote-scope-extractor.ts sync path)
// =============================================================================

const BATCH_SYSTEM_PROMPT = `You are a remote-work scope classifier for job postings. Read the job description text and classify the remote scope.

Classify as one of:
- "global": The job is remote with no geographic restrictions (e.g., "Remote - Global", "work from anywhere", "distributed team").
- "country_fenced": The job is remote but restricted to specific countries (e.g., "Remote - US Only", "must reside in Germany"). Provide the country codes in allowedCountries.
- "region_fenced": The job is remote but restricted to a broad region (e.g., "Remote - Latam", "Remote - APAC", "Remote - EMEA").
- "onsite": The job requires physical presence at a specific location (on-site or hybrid).
- "undetermined": The job description does not provide enough information to classify the remote scope.

CRITICAL RULES:
1. NEVER default to "onsite" or "country_fenced" when the scope is unclear. Use "undetermined" instead.
2. Ignore company headquarters / location metadata — only use the job description text itself.
3. "Remote" with no geographic qualifier should be classified as "global" (most inclusive interpretation).
4. Work authorization requirements (e.g., "authorized to work in US") indicate country_fenced, not global.
5. Extract allowedCountries as ISO 3166-1 alpha-2 codes (e.g., "US", "GB", "DE") when country_fenced. Null for all other scopes.

Respond with a JSON object matching this schema:
{
  "remoteScope": "global" | "country_fenced" | "region_fenced" | "onsite" | "undetermined",
  "allowedCountries": ["US", "GB", ...] | null,
  "workAuthRequired": boolean,
  "confidence": 0.0-1.0
}`;

// =============================================================================
// BATCH SUBMISSION
// =============================================================================

/**
 * Build a JSONL file content for the OpenAI Batch API from a list of inputs.
 *
 * Each line is a Chat Completions request with the system prompt and the job
 * text as the user message. Uses gpt-4o-mini (same model as the sync path)
 * with response_format json_object for structured output.
 */
function buildBatchJsonl(inputs: BatchLlmInput[]): string {
  const lines = inputs.map((input) => {
    const request = {
      custom_id: input.customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: BATCH_SYSTEM_PROMPT },
          { role: "user", content: input.text },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      },
    };
    return JSON.stringify(request);
  });
  return lines.join("\n");
}

/**
 * Submit a batch of job texts for remote-scope classification via the OpenAI
 * Batch API.
 *
 * The batch has up to 24hr turnaround and costs 50% of the sync path. Use
 * this for SLA-indifferent paths only (content-drift re-normalization,
 * dormant-tier, backlog catch-up).
 *
 * @param inputs Array of { customId, text } entries.
 * @returns Batch submission metadata (batch ID, status, expiry).
 */
export async function submitBatch(
  inputs: BatchLlmInput[],
): Promise<BatchSubmission> {
  if (inputs.length === 0) {
    throw new Error("Cannot submit an empty batch");
  }

  const client = getClient();
  const jsonlContent = buildBatchJsonl(inputs);

  // Create a file for the batch input.
  const file = await client.files.create({
    file: new File([jsonlContent], "batch-input.jsonl", {
      type: "application/jsonl",
    }),
    purpose: "batch",
  });

  // Submit the batch.
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
    metadata: {
      description: "remote-scope-classification",
    },
  });

  return {
    batchId: batch.id,
    status: batch.status as BatchStatus,
    requestCount: batch.request_counts?.total ?? inputs.length,
    createdAt: new Date(batch.created_at * 1000).toISOString(),
    expiresAt: batch.expires_at
      ? new Date(batch.expires_at * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

// =============================================================================
// BATCH RETRIEVAL
// =============================================================================

/**
 * Check the status of a submitted batch.
 *
 * @param batchId The OpenAI batch ID.
 * @returns Current batch status and metadata.
 */
export async function checkBatchStatus(
  batchId: string,
): Promise<BatchSubmission> {
  const client = getClient();
  const batch = await client.batches.retrieve(batchId);

  return {
    batchId: batch.id,
    status: batch.status as BatchStatus,
    requestCount: batch.request_counts?.total ?? 0,
    createdAt: new Date(batch.created_at * 1000).toISOString(),
    expiresAt: batch.expires_at
      ? new Date(batch.expires_at * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Retrieve results from a completed batch.
 *
 * @param batchId The OpenAI batch ID (must be status "completed").
 * @returns Array of results, one per input custom_id.
 */
export async function retrieveBatchResults(
  batchId: string,
): Promise<BatchLlmResult[]> {
  const client = getClient();
  const batch = await client.batches.retrieve(batchId);

  if (batch.status !== "completed") {
    throw new Error(
      `Batch ${batchId} is not completed (status: ${batch.status})`,
    );
  }

  if (!batch.output_file_id) {
    throw new Error(`Batch ${batchId} has no output file`);
  }

  // Download the output file (JSONL format).
  const fileResponse = await client.files.content(batch.output_file_id);
  const jsonlContent = await fileResponse.text();

  const results: BatchLlmResult[] = [];
  for (const line of jsonlContent.split("\n")) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);
      const customId = entry.custom_id;
      const status =
        entry.response?.status_code === 200 ? "completed" : "failed";

      if (status === "completed") {
        const content = entry.response?.body?.choices?.[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            results.push({
              customId,
              output: {
                remoteScope: parsed.remoteScope,
                allowedCountries: parsed.allowedCountries ?? null,
                workAuthRequired: parsed.workAuthRequired ?? false,
                confidence: parsed.confidence ?? 0,
              },
              error: null,
              status,
            });
          } catch {
            results.push({
              customId,
              output: null,
              error: "Failed to parse LLM output JSON",
              status: "failed",
            });
          }
        } else {
          results.push({
            customId,
            output: null,
            error: "Empty response content",
            status: "failed",
          });
        }
      } else {
        results.push({
          customId,
          output: null,
          error: entry.error?.message ?? "Unknown batch error",
          status: "failed",
        });
      }
    } catch {
      // Skip unparseable lines — shouldn't happen with valid Batch API output.
    }
  }

  return results;
}

/**
 * Cancel a batch that is no longer needed (e.g., jobs were re-normalized
 * via the sync path while the batch was pending).
 *
 * @param batchId The OpenAI batch ID.
 */
export async function cancelBatch(batchId: string): Promise<void> {
  const client = getClient();
  await client.batches.cancel(batchId);
}
