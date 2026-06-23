// recomputeTagsExperience — Transactional Re-aggregation
// src/lib/onboarding/recompute-tags.ts
//
// Implements MODULE_A_DECISIONS.md AR1 (Transactional Re-aggregation) and §11
// (Experience Level — Derived, Not Stored). Reads all workingHistory rows for
// an applicant, merges overlapping date ranges per canonical tag, computes the
// total years of experience per tag, and replaces the tagsExperience rows.
//
// CRITICAL: this function receives the transaction object `tx` as a parameter.
// It does NOT create its own transaction. The caller (e.g.
// finalizeOnboardingAction) wraps the entire operation in `db.transaction()`.
// If any step fails, the whole operation rolls back — persona data can never
// be left in a corrupted half-state.
//
// After recomputing tagsExperience it also:
//   7. Rebuilds applicant.allTags as the union of active canonical tags.
//   8. Regenerates persona embeddings for any persona whose mustHaveTags are
//      no longer fully covered by the active tag set (MODULE_A_DECISIONS.md §12).

import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db/db";
import {
  applicant,
  persona,
  tagsExperience,
  workingHistory,
} from "@/db/schemas";
import { generateEmbedding } from "@/lib/ai/embeddings";

/** A date range with inclusive start and exclusive end semantics for merging. */
export type DateRange = { start: Date; end: Date };

/** Number of milliseconds in a Julian year (365.25 days) — used for year math. */
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

/**
 * Merge overlapping (or adjacent) date ranges into the minimal set of
 * non-overlapping ranges. Used to avoid double-counting experience years when
 * a developer held two roles simultaneously that both used the same skill.
 *
 * Algorithm: sort by start, then fold — extend the current range when the next
 * start is <= current end, otherwise start a new range.
 */
export function mergeOverlappingRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: DateRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start.getTime() <= last.end.getTime()) {
      // Overlap or adjacency — extend the current range to the later end.
      last.end = new Date(
        Math.max(last.end.getTime(), sorted[i].end.getTime()),
      );
    } else {
      merged.push({ ...sorted[i] });
    }
  }

  return merged;
}

/**
 * Compute total years of experience across a set of (possibly overlapping)
 * date ranges, after merging. Rounded to one decimal place.
 */
export function sumYearsFromRanges(ranges: DateRange[]): number {
  const merged = mergeOverlappingRanges(ranges);
  const totalMs = merged.reduce(
    (sum, r) => sum + (r.end.getTime() - r.start.getTime()),
    0,
  );
  return Math.round((totalMs / MS_PER_YEAR) * 10) / 10;
}

/**
 * Drizzle transaction object type, derived from the live `db` instance so it
 * stays correct regardless of whether we use neon-http or neon-serverless.
 */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Recompute tagsExperience from workingHistory for a given applicant.
 * MUST be called inside a `db.transaction()` block — see AR1.
 *
 * Steps:
 *   1. Read all workingHistory rows for the applicant.
 *   2. For each canonical tag, collect all date ranges where it appears.
 *   3. Merge overlapping date ranges per tag (the overlap algorithm).
 *   4. Calculate total years of experience per tag.
 *   5. Delete existing tagsExperience rows for the applicant.
 *   6. Insert recomputed rows.
 *   7. Rebuild applicant.allTags as the union of active tags.
 *   8. Regenerate persona embeddings for personas whose mustHaveTags are no
 *      longer fully covered by the active tag set.
 */
export async function recomputeTagsExperience(
  tx: DbTx,
  applicantId: string,
): Promise<void> {
  // 1. Read all working history for the applicant.
  const history = await tx
    .select()
    .from(workingHistory)
    .where(eq(workingHistory.applicantId, applicantId));

  // 2. Collect date ranges per canonical tag.
  const tagRangesMap = new Map<string, DateRange[]>();
  const now = new Date();
  for (const entry of history) {
    const start = new Date(entry.startDate);
    const end = entry.endDate ? new Date(entry.endDate) : now;
    // Skip malformed rows where end precedes start (defensive — LLM dates).
    if (end.getTime() < start.getTime()) continue;

    for (const tag of entry.canonicalSkillsDetected) {
      const ranges = tagRangesMap.get(tag) ?? [];
      ranges.push({ start, end });
      tagRangesMap.set(tag, ranges);
    }
  }

  // 3-4. Merge ranges and compute years per tag.
  const tagYears = new Map<string, number>();
  for (const [tag, ranges] of tagRangesMap) {
    tagYears.set(tag, sumYearsFromRanges(ranges));
  }

  // 5. Delete existing tagsExperience rows.
  await tx
    .delete(tagsExperience)
    .where(eq(tagsExperience.applicantId, applicantId));

  // 6. Insert recomputed rows (all marked active on recompute).
  if (tagYears.size > 0) {
    await tx.insert(tagsExperience).values(
      Array.from(tagYears.entries()).map(
        ([canonicalTag, yearsOfExperience]) => ({
          applicantId,
          canonicalTag,
          yearsOfExperience: yearsOfExperience.toString(),
          active: true,
        }),
      ),
    );
  }

  // 7. Rebuild applicant.allTags as the union of active canonical tags.
  const activeTags = Array.from(tagYears.keys());
  await tx
    .update(applicant)
    .set({ allTags: activeTags })
    .where(eq(applicant.userId, applicantId));

  // 8. Regenerate persona embeddings when mustHaveTags are no longer fully
  //    covered by the active tag set (MODULE_A_DECISIONS.md §12).
  const personas = await tx
    .select()
    .from(persona)
    .where(eq(persona.applicantId, applicantId));

  const activeTagSet = new Set(activeTags);
  for (const p of personas) {
    const allTagsPresent = p.mustHaveTags.every((t) => activeTagSet.has(t));
    if (!allTagsPresent) {
      const embedding = await generateEmbedding(p.embeddingSummary);
      await tx
        .update(persona)
        .set({ personaEmbedding: embedding })
        .where(eq(persona.id, p.id));
    }
  }
}
