// Inbound Emails Table — Resend Inbound webhook storage
// src/db/schemas/jobs/inboundEmail.ts
//
// Stores emails received via Resend Inbound (webhook → email.received event).
// Resend receives on port 25 at their edge and delivers metadata via webhook;
// full content (HTML, text, headers, attachments) is fetched via the
// Received emails API on demand.
//
// Folders: inbox | trash — soft-delete moves to trash, permanent delete
// removes the row entirely.
//
// See: https://resend.com/docs/dashboard/receiving/

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

// ── Table ────────────────────────────────────────────────────────────────────

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Resend's unique email ID (used to fetch full content via API)
    resendEmailId: text("resend_email_id").notNull().unique(),

    // Envelope addresses (SMTP transport — trustworthy)
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),

    // Parsed headers (from webhook metadata)
    subject: text("subject"),
    messageId: text("message_id"),

    // Full content — fetched lazily from Resend API on first access
    // (webhooks only include metadata; content is retrieved separately)
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    headers: text("headers"), // JSON string of all headers

    // Attachment count (metadata only; attachments fetched via API)
    attachmentCount: text("attachment_count").default("0"),

    // Processing status: received | fetched | processed | error
    status: text("status").notNull().default("received"),
    error: text("error"),

    // ── Mailbox management ──────────────────────────────────────────────────
    isRead: boolean("is_read").notNull().default(false),
    // inbox | trash — soft-delete moves to trash
    folder: text("folder").notNull().default("inbox"),
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Index for looking up by Resend email ID
    resendEmailIdIdx: index("inbound_emails_resend_email_id_idx").on(
      table.resendEmailId,
    ),
    // Index for querying by recipient address (routing, dashboard)
    toAddressIdx: index("inbound_emails_to_address_idx").on(table.toAddress),
    // Index for sorting by creation date (dashboard inbox view)
    createdAtIdx: index("inbound_emails_created_at_idx").on(table.createdAt),
    // Index for filtering by folder (inbox vs trash)
    folderIdx: index("inbound_emails_folder_idx").on(table.folder),
    // Index for filtering unread emails
    isReadIdx: index("inbound_emails_is_read_idx").on(table.isRead),
  }),
);

export const inboundEmailSchema = createInsertSchema(inboundEmails);
export type InboundEmailSchema = z.infer<typeof inboundEmailSchema>;

export type InboundEmail = typeof inboundEmails.$inferSelect;
export type NewInboundEmail = typeof inboundEmails.$inferInsert;
