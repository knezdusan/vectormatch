"use server";

// VM Mail Server Actions — Inbox, Compose, Sent, Trash
// src/actions/mail.ts
//
// Server Actions for the VM Mail admin feature. These allow admins to:
//   - List emails (inbound inbox, sent, trash)
//   - Send new emails via Resend API
//   - Mark emails as read/unread
//   - Soft-delete (move to trash) and restore
//   - Permanently delete from trash
//
// Security: every action calls requireRole("admin").

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@/db/db";
import { inboundEmails } from "@/db/schemas/jobs/inboundEmail";
import { sentEmails } from "@/db/schemas/jobs/sentEmail";
import { requireRole } from "@/lib/auth";
import { sendEmailViaResend } from "@/lib/mail";

const FROM_FALLBACK =
  process.env.RESEND_FROM_EMAIL ?? "VectorMatch <onboarding@resend.dev>";

// ── Types ────────────────────────────────────────────────────────────────────

export type MailActionState = {
  success: boolean;
  error?: string;
  data?: unknown;
};

// ── Schemas ──────────────────────────────────────────────────────────────────

const emailIdSchema = z.string().uuid();

const composeSchema = z.object({
  to: z
    .string()
    .min(1, "At least one recipient is required")
    .max(2000, "Recipient list too long"),
  cc: z.string().max(2000).optional().or(z.literal("")),
  bcc: z.string().max(2000).optional().or(z.literal("")),
  subject: z.string().min(1, "Subject is required").max(500),
  htmlBody: z.string().min(1, "Email body cannot be empty").max(1_000_000),
  textBody: z.string().max(500_000).optional().or(z.literal("")),
  replyToId: z.string().uuid().optional(),
  from: z.string().max(200).optional(),
});

// ── Query Actions ────────────────────────────────────────────────────────────

/**
 * List inbound emails with optional filtering and sorting.
 */
export async function listInboundEmails(params: {
  folder?: "inbox" | "trash";
  search?: string;
  unreadOnly?: boolean;
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}) {
  await requireRole("admin");

  const folder = params.folder ?? "inbox";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const sort = params.sort ?? "newest";

  const conditions = [eq(inboundEmails.folder, folder)];

  if (params.unreadOnly) {
    conditions.push(eq(inboundEmails.isRead, false));
  }

  if (params.search) {
    const pattern = `%${params.search}%`;
    const searchCondition = or(
      ilike(inboundEmails.fromAddress, pattern),
      ilike(inboundEmails.toAddress, pattern),
      ilike(inboundEmails.subject, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const orderBy =
    sort === "oldest"
      ? asc(inboundEmails.createdAt)
      : desc(inboundEmails.createdAt);

  const rows = await db
    .select({
      id: inboundEmails.id,
      resendEmailId: inboundEmails.resendEmailId,
      fromAddress: inboundEmails.fromAddress,
      toAddress: inboundEmails.toAddress,
      subject: inboundEmails.subject,
      isRead: inboundEmails.isRead,
      folder: inboundEmails.folder,
      status: inboundEmails.status,
      hasHtml: sql<boolean>`${inboundEmails.htmlBody} IS NOT NULL`,
      attachmentCount: inboundEmails.attachmentCount,
      createdAt: inboundEmails.createdAt,
    })
    .from(inboundEmails)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Get a single inbound email with full content.
 * Marks the email as read automatically.
 */
export async function getInboundEmail(id: string) {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const rows = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, parsed.data))
    .limit(1);

  const email = rows[0];
  if (!email) return null;

  // Auto-mark as read when opened
  if (!email.isRead) {
    await db
      .update(inboundEmails)
      .set({ isRead: true, updatedAt: new Date() })
      .where(eq(inboundEmails.id, parsed.data));
    revalidatePath("/dashboard/admin/mail");
  }

  return email;
}

/**
 * List sent emails with optional filtering and sorting.
 */
export async function listSentEmails(params: {
  folder?: "sent" | "trash";
  search?: string;
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}) {
  await requireRole("admin");

  const folder = params.folder ?? "sent";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const sort = params.sort ?? "newest";

  const conditions = [eq(sentEmails.folder, folder)];

  if (params.search) {
    const pattern = `%${params.search}%`;
    const searchCondition = or(
      ilike(sentEmails.toAddress, pattern),
      ilike(sentEmails.subject, pattern),
      ilike(sentEmails.fromAddress, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const orderBy =
    sort === "oldest" ? asc(sentEmails.createdAt) : desc(sentEmails.createdAt);

  const rows = await db
    .select({
      id: sentEmails.id,
      resendEmailId: sentEmails.resendEmailId,
      fromAddress: sentEmails.fromAddress,
      toAddress: sentEmails.toAddress,
      cc: sentEmails.cc,
      subject: sentEmails.subject,
      status: sentEmails.status,
      folder: sentEmails.folder,
      hasHtml: sql<boolean>`${sentEmails.htmlBody} IS NOT NULL`,
      createdAt: sentEmails.createdAt,
    })
    .from(sentEmails)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Get a single sent email with full content.
 */
export async function getSentEmail(id: string) {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const rows = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.id, parsed.data))
    .limit(1);

  return rows[0] ?? null;
}

// ── Mutation Actions ─────────────────────────────────────────────────────────

/**
 * Send a new email via Resend and log it in sent_emails.
 */
export async function sendMailAction(
  _prev: MailActionState,
  formData: FormData,
): Promise<MailActionState> {
  await requireRole("admin");

  const raw = {
    to: formData.get("to") as string,
    cc: (formData.get("cc") as string) || "",
    bcc: (formData.get("bcc") as string) || "",
    subject: formData.get("subject") as string,
    htmlBody: formData.get("htmlBody") as string,
    textBody: (formData.get("textBody") as string) || "",
    replyToId: (formData.get("replyToId") as string) || undefined,
    from: (formData.get("from") as string) || undefined,
  };

  const parsed = composeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    const result = await sendEmailViaResend({
      to: parsed.data.to,
      cc: parsed.data.cc || undefined,
      bcc: parsed.data.bcc || undefined,
      subject: parsed.data.subject,
      html: parsed.data.htmlBody,
      text: parsed.data.textBody || undefined,
      from: parsed.data.from || undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Log to sent_emails
    await db.insert(sentEmails).values({
      resendEmailId: result.id ?? null,
      fromAddress: result.from ?? FROM_FALLBACK,
      toAddress: parsed.data.to,
      cc: parsed.data.cc || null,
      bcc: parsed.data.bcc || null,
      subject: parsed.data.subject,
      htmlBody: parsed.data.htmlBody,
      textBody: parsed.data.textBody || null,
      status: "sent",
      folder: "sent",
    });

    revalidatePath("/dashboard/admin/mail");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to send email",
    };
  }
}

/**
 * Mark an inbound email as read or unread.
 */
export async function markEmailReadAction(
  id: string,
  isRead: boolean,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db
    .update(inboundEmails)
    .set({ isRead, updatedAt: new Date() })
    .where(eq(inboundEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Soft-delete an inbound email (move to trash).
 */
export async function deleteInboundEmailAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db
    .update(inboundEmails)
    .set({ folder: "trash", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(inboundEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Restore an inbound email from trash to inbox.
 */
export async function restoreInboundEmailAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db
    .update(inboundEmails)
    .set({ folder: "inbox", deletedAt: null, updatedAt: new Date() })
    .where(eq(inboundEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Permanently delete an inbound email from trash.
 */
export async function permanentDeleteInboundAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db.delete(inboundEmails).where(eq(inboundEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Soft-delete a sent email (move to trash).
 */
export async function deleteSentEmailAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db
    .update(sentEmails)
    .set({ folder: "trash", deletedAt: new Date() })
    .where(eq(sentEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Restore a sent email from trash.
 */
export async function restoreSentEmailAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db
    .update(sentEmails)
    .set({ folder: "sent", deletedAt: null })
    .where(eq(sentEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

/**
 * Permanently delete a sent email from trash.
 */
export async function permanentDeleteSentAction(
  id: string,
): Promise<MailActionState> {
  await requireRole("admin");
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Invalid email ID" };

  await db.delete(sentEmails).where(eq(sentEmails.id, parsed.data));

  revalidatePath("/dashboard/admin/mail");
  return { success: true };
}

// ── Lazy Resend client for sync ──────────────────────────────────────────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Manually sync new emails from Resend's Receiving API.
 *
 * Pulls the latest received emails from Resend and inserts any that aren't
 * already in our database. Also fetches full content (HTML, text, headers)
 * for each new email.
 *
 * Returns the count of newly synced emails.
 */
export async function syncInboundEmailsAction(): Promise<{
  success: boolean;
  newCount: number;
  error?: string;
}> {
  await requireRole("admin");

  try {
    // Fetch recent received emails from Resend (max 100 per call)
    const { data: listData, error: listError } =
      await getResend().emails.receiving.list({ limit: 100 });

    if (listError) {
      return {
        success: false,
        newCount: 0,
        error:
          typeof listError === "object" && listError !== null
            ? JSON.stringify(listError)
            : String(listError),
      };
    }

    const receivedEmails = (listData?.data ?? []) as Array<{
      id: string;
      from: string;
      to: string[];
      subject: string | null;
      message_id: string | null;
      attachments?: unknown[];
      created_at: string;
    }>;

    if (receivedEmails.length === 0) {
      return { success: true, newCount: 0 };
    }

    // Find which ones we already have in the database
    const resendIds = receivedEmails.map((e) => e.id);
    const existing = await db
      .select({ resendEmailId: inboundEmails.resendEmailId })
      .from(inboundEmails)
      .where(inArray(inboundEmails.resendEmailId, resendIds));
    const existingIds = new Set(existing.map((r) => r.resendEmailId));

    // Filter to only new emails
    const newEmails = receivedEmails.filter((e) => !existingIds.has(e.id));

    if (newEmails.length === 0) {
      return { success: true, newCount: 0 };
    }

    // Insert all new emails (metadata only first)
    let inserted = 0;
    for (const email of newEmails) {
      try {
        await db
          .insert(inboundEmails)
          .values({
            resendEmailId: email.id,
            fromAddress: email.from,
            toAddress: email.to?.[0] ?? "",
            subject: email.subject ?? null,
            messageId: email.message_id ?? null,
            attachmentCount: String(email.attachments?.length ?? 0),
            status: "received",
            folder: "inbox",
            isRead: false,
          })
          .onConflictDoNothing({
            target: inboundEmails.resendEmailId,
          });
        inserted++;
      } catch {
        // Skip duplicates or errors on individual inserts
      }
    }

    // Fetch full content for each new email (best-effort)
    for (const email of newEmails) {
      try {
        const { data: fullEmail, error: fetchError } =
          await getResend().emails.receiving.get(email.id);

        if (fetchError || !fullEmail) {
          // Mark as error but don't fail the sync
          await db
            .update(inboundEmails)
            .set({
              status: "error",
              error: fetchError
                ? typeof fetchError === "object"
                  ? JSON.stringify(fetchError)
                  : String(fetchError)
                : "No data returned",
              updatedAt: new Date(),
            })
            .where(eq(inboundEmails.resendEmailId, email.id));
          continue;
        }

        await db
          .update(inboundEmails)
          .set({
            htmlBody: fullEmail.html ?? null,
            textBody: fullEmail.text ?? null,
            headers: fullEmail.headers
              ? JSON.stringify(fullEmail.headers)
              : null,
            status: "fetched",
            updatedAt: new Date(),
          })
          .where(eq(inboundEmails.resendEmailId, email.id));
      } catch {
        // Non-fatal — the email metadata is stored, content can be fetched later
      }
    }

    revalidatePath("/dashboard/admin/mail");
    return { success: true, newCount: inserted };
  } catch (e) {
    return {
      success: false,
      newCount: 0,
      error: e instanceof Error ? e.message : "Failed to sync emails",
    };
  }
}

/**
 * Get unread count for badge display.
 */
export async function getUnreadInboundCount(): Promise<number> {
  try {
    await requireRole("admin");
  } catch {
    return 0;
  }
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboundEmails)
    .where(
      and(eq(inboundEmails.folder, "inbox"), eq(inboundEmails.isRead, false)),
    );
  return rows[0]?.count ?? 0;
}
