// CV Upload Cleanup Logic
// src/lib/onboarding/cleanup-cv-uploads.ts
//
// Pure database logic for the cleanupOrphanedCvUploads Inngest function. Kept
// separate from Inngest so it can be unit-tested without invoking the Inngest
// runtime.

import { and, eq, inArray, lt, notExists } from "drizzle-orm";

import { db } from "@/db/db";
import { cvUpload, workingHistory } from "@/db/schemas";

export type CleanupCvUploadsResult = {
  deletedProcessingCount: number;
  deletedOrphanCount: number;
};

/**
 * Delete abandoned CV uploads:
 *   1. Stuck "processing" rows older than `processingMaxAgeMs`.
 *   2. Rows with no working_history children older than `orphanMaxAgeMs`.
 *
 * Defaults: processing 24h, orphan 7d.
 */
export async function cleanupOrphanedCvUploads(
  processingMaxAgeMs = 24 * 60 * 60 * 1000,
  orphanMaxAgeMs = 7 * 24 * 60 * 60 * 1000,
): Promise<CleanupCvUploadsResult> {
  const stuckProcessingCutoff = new Date(Date.now() - processingMaxAgeMs);
  const orphanCutoff = new Date(Date.now() - orphanMaxAgeMs);

  // Remove stuck processing rows.
  const deletedProcessing = await db
    .delete(cvUpload)
    .where(
      and(
        eq(cvUpload.status, "processing"),
        lt(cvUpload.createdAt, stuckProcessingCutoff),
      ),
    )
    .returning({ id: cvUpload.id });

  // Remove orphaned rows with no working_history children.
  const orphanedIds = await db
    .select({ id: cvUpload.id })
    .from(cvUpload)
    .where(
      and(
        lt(cvUpload.createdAt, orphanCutoff),
        notExists(
          db
            .select()
            .from(workingHistory)
            .where(eq(workingHistory.cvUploadId, cvUpload.id)),
        ),
      ),
    );

  if (orphanedIds.length > 0) {
    await db.delete(cvUpload).where(
      inArray(
        cvUpload.id,
        orphanedIds.map((row) => row.id),
      ),
    );
  }

  return {
    deletedProcessingCount: deletedProcessing.length,
    deletedOrphanCount: orphanedIds.length,
  };
}
