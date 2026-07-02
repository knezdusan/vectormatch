// Resend Webhook Handler — Inbound Email
// src/app/api/webhooks/resend/route.ts
//
// Receives webhook events from Resend. Currently handles:
//   - email.received: An inbound email was received by Resend for our domain.
//
// The webhook payload includes only metadata (from, to, subject, attachments
// count). Full email content (HTML, text, headers) is fetched via the Resend
// Received emails API and stored in the inbound_emails table.
//
// See:
//   - https://resend.com/docs/dashboard/receiving/
//   - https://resend.com/docs/webhooks/verify-webhooks-requests

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/db/db";
import { inboundEmails } from "@/db/schemas/jobs/inboundEmail";

// Lazy Resend client — same pattern as src/lib/email.ts
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function POST(req: NextRequest) {
  // ── 1. Read raw body for signature verification ───────────────────────────
  const payload = await req.text();

  // ── 2. Verify webhook signature ───────────────────────────────────────────
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    }) as unknown as { type: string; data: Record<string, unknown> };
  } catch (err) {
    console.error("[resend-webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  // ── 3. Handle email.received event ────────────────────────────────────────
  if (event.type !== "email.received") {
    // Acknowledge other event types (email.sent, email.delivered, etc.)
    // without processing — only inbound is handled here.
    return NextResponse.json({ ok: true });
  }

  const data = event.data;
  const emailId = data.email_id as string;
  const fromAddress = data.from as string;
  const toAddress = (data.to as string[])?.[0] ?? "";
  const subject = (data.subject as string) ?? null;
  const messageId = (data.message_id as string) ?? null;
  const attachments = (data.attachments as unknown[]) ?? [];
  const attachmentCount = String(attachments.length);

  console.log(
    `[resend-webhook] Received email: ${fromAddress} → ${toAddress} | "${subject}"`,
  );

  // ── 4. Store metadata in database ─────────────────────────────────────────
  try {
    await db
      .insert(inboundEmails)
      .values({
        resendEmailId: emailId,
        fromAddress,
        toAddress,
        subject,
        messageId,
        attachmentCount,
        status: "received",
      })
      .onConflictDoNothing({
        target: inboundEmails.resendEmailId,
      });
  } catch (err) {
    console.error("[resend-webhook] Failed to store email metadata:", err);
    // Don't fail the webhook — Resend will retry, and we don't want duplicates
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // ── 5. Fetch full email content (best-effort, non-blocking) ───────────────
  // The webhook only includes metadata. Full content (HTML, text, headers)
  // must be fetched via the Received emails API. We do this asynchronously
  // so the webhook responds quickly (Resend has a timeout).
  fetchEmailContent(emailId).catch((err) => {
    console.error(
      `[resend-webhook] Failed to fetch content for ${emailId}:`,
      err,
    );
  });

  return NextResponse.json({ ok: true });
}

// ── Helper: Fetch full email content from Resend API ─────────────────────────
async function fetchEmailContent(emailId: string): Promise<void> {
  const { data: email, error } =
    await getResend().emails.receiving.get(emailId);

  if (error) {
    console.error(`[resend-webhook] Resend API error for ${emailId}:`, error);
    await db
      .update(inboundEmails)
      .set({
        status: "error",
        error: String(error),
        updatedAt: new Date(),
      })
      .where(eq(inboundEmails.resendEmailId, emailId));
    return;
  }

  await db
    .update(inboundEmails)
    .set({
      htmlBody: email.html ?? null,
      textBody: email.text ?? null,
      headers: email.headers ? JSON.stringify(email.headers) : null,
      status: "fetched",
      updatedAt: new Date(),
    })
    .where(eq(inboundEmails.resendEmailId, emailId));

  console.log(`[resend-webhook] Fetched content for ${emailId}`);
}
