import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";
import { applicant } from "./applicant";
import { job } from "./job";

export const matchQueue = pgTable(
  "match_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    overlapScore: integer("overlap_score").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueMatch: index("match_queue_unique").on(table.jobId, table.applicantId),
  }),
);

export const matchQueueSchema = createInsertSchema(matchQueue);
export type MatchQueueSchema = z.infer<typeof matchQueueSchema>;

export type MatchQueue = typeof matchQueue.$inferSelect;
export type NewMatchQueue = typeof matchQueue.$inferInsert;
