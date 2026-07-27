// Vector parsing utility — extracted from src/inngest/functions.ts (D27)
// src/lib/jobs/parse-vector.ts

/**
 * Parse a pgvector text string "[0.1,0.2,...]" into a number[].
 * Returns empty array if the input is null/empty/malformed.
 */
export function parseVectorString(
  str: string | null | undefined,
): number[] {
  if (!str || typeof str !== "string") return [];
  // pgvector format: [0.1,0.2,...]
  const trimmed = str.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1);
  if (!inner) return [];
  return inner.split(",").map((n) => Number.parseFloat(n.trim()));
}
