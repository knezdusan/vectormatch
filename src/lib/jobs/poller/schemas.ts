// Poller Schemas — Inngest Event Payloads
// src/lib/jobs/poller/schemas.ts
//
// Zod schemas for the poller's Inngest event payloads. These validate the
// data before it reaches the domain logic, ensuring type safety at the
// Inngest boundary.
//
// See TDD §4.4 (Phalanx Poller) and §4.2.3 (Zod schema inventory).

import { z } from "zod";

// ── Event payloads ───────────────────────────────────────────────────────────

/** Payload for the `poller/poll-company` event (per-company fan-out). */
export const pollCompanyEventSchema = z.object({
  companyId: z.string().uuid(),
  atsSource: z.enum(["greenhouse", "lever", "ashby"]),
  atsSlug: z.string().min(1),
});

/** Payload for the `poller/run` event (full tier sweep or single company). */
export const pollerRunEventSchema = z.object({
  companyId: z.string().uuid().optional(),
  tier: z.enum(["active", "dormant"]).optional(),
});

/** Payload for the `job/ingested` event (B→C handoff).
 *
 * Note: `externalJobId` and `title` are optional here because the poller's
 * `PollResult` only returns `newJobIds` (UUIDs). The `jobIngestedHandler`
 * (Module C) fetches the full job from DB by `jobId`. These fields are
 * included in the schema for forward-compatibility — if a future caller
 * has them available, they can include them to save the handler a DB lookup.
 */
export const jobIngestedEventSchema = z.object({
  jobId: z.string().uuid(),
  atsSource: z.enum(["greenhouse", "lever", "ashby"]),
  atsSlug: z.string().min(1),
  externalJobId: z.string().optional(),
  title: z.string().optional(),
  isNew: z.boolean(),
});

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type PollCompanyEvent = z.infer<typeof pollCompanyEventSchema>;
export type PollerRunEvent = z.infer<typeof pollerRunEventSchema>;
export type JobIngestedEvent = z.infer<typeof jobIngestedEventSchema>;
