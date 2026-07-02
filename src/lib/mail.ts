// VM Mail — Resend send helper with logging support
// src/lib/mail.ts
//
// Wraps the Resend SDK for the VM Mail compose feature. Returns the
// Resend email ID and the from-address used, so the caller can log
// the sent email in the sent_emails table.

import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "VectorMatch <onboarding@resend.dev>";

export type SendEmailResult = {
  success: boolean;
  id?: string;
  from?: string;
  error?: string;
};

/**
 * Send an email via Resend and return the result.
 * Does NOT log to the database — the caller is responsible for that.
 */
export async function sendEmailViaResend(params: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: params.to
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      cc: params.cc
        ? params.cc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      bcc: params.bcc
        ? params.bcc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (error) {
      return {
        success: false,
        error:
          typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error),
      };
    }

    return { success: true, id: data?.id, from: FROM_EMAIL };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to send email",
    };
  }
}
