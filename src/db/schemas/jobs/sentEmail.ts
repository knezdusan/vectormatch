// Sent Emails Table — Outbound email log
// src/db/schemas/jobs/sentEmail.ts
//
// Stores a record of every email sent via the VM Mail compose interface.
// The actual sending is done through the Resend API (src/lib/email.ts);
// this table provides a local log for the Sent folder in the admin UI.

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Resend's email ID (returned by the send API)
    resendEmailId: text("resend_email_id"),

    // Sender address (typically RESEND_FROM_EMAIL)
    fromAddress: text("from_address").notNull(),
    // Comma-separated recipient list
    toAddress: text("to_address").notNull(),
    cc: text("cc"),
    bcc: text("bcc"),

    subject: text("subject"),
    htmlBody: text("html_body"),
    textBody: text("text_body"),

    // Delivery status from Resend: sent | delivered | bounced | complained
    status: text("status").notNull().default("sent"),
    error: text("error"),

    // Soft-delete: sent | trash
    folder: text("folder").notNull().default("sent"),
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    resendEmailIdIdx: index("sent_emails_resend_email_id_idx").on(
      table.resendEmailId,
    ),
    toAddressIdx: index("sent_emails_to_address_idx").on(table.toAddress),
    createdAtIdx: index("sent_emails_created_at_idx").on(table.createdAt),
    folderIdx: index("sent_emails_folder_idx").on(table.folder),
  }),
);

export const sentEmailSchema = createInsertSchema(sentEmails);
export type SentEmailSchema = z.infer<typeof sentEmailSchema>;

export type SentEmail = typeof sentEmails.$inferSelect;
export type NewSentEmail = typeof sentEmails.$inferInsert;
