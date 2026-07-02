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

const DEFAULT_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "VectorMatch <onboarding@resend.dev>";

// Allowed sender identities for the VM Mail compose form.
// All addresses must be on a domain verified in Resend.
// The display name is paired with the address to form the From header.
export const SENDER_IDENTITIES = [
  {
    label: "VectorMatch <noreply@vectormatch.dev>",
    value: "VectorMatch <noreply@vectormatch.dev>",
  },
  {
    label: "VectorMatch <office@vectormatch.dev>",
    value: "VectorMatch <office@vectormatch.dev>",
  },
  {
    label: "VectorMatch <support@vectormatch.dev>",
    value: "VectorMatch <support@vectormatch.dev>",
  },
  {
    label: "VectorMatch <info@vectormatch.dev>",
    value: "VectorMatch <info@vectormatch.dev>",
  },
] as const;

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
  from?: string;
}): Promise<SendEmailResult> {
  const fromAddress = params.from ?? DEFAULT_FROM_EMAIL;
  try {
    const { data, error } = await getResend().emails.send({
      from: fromAddress,
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

    return { success: true, id: data?.id, from: fromAddress };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to send email",
    };
  }
}
