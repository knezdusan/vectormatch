import { Resend } from "resend";

// Lazy initialization — the Resend constructor throws "Missing API key" if
// RESEND_API_KEY is unset, which crashes Next.js static generation because
// auth.ts imports this module at the top level. The client is only created on
// first use (a live request), never at module import / build time.
let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function isTestEmail(email: string): boolean {
  return email.endsWith("@example.com");
}

export async function sendVerificationEmail({
  email,
  url,
}: {
  email: string;
  url: string;
}) {
  if (isTestEmail(email)) {
    console.log("[test] skip sendVerificationEmail", email, url);
    return { id: "test-id" };
  }
  const { data, error } = await getResend().emails.send({
    from: "VectorMatch <onboarding@resend.dev>",
    to: email,
    subject: "Verify your email address - VectorMatch",
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111827; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: #111827; margin: 0;">VectorMatch</h1>
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; background-color: #fafafa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16px;">Verify your email address</h2>
          <p style="font-size: 16px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
            Thank you for signing up for VectorMatch. To complete your registration and secure your account, please verify your email address by clicking the button below:
          </p>
          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${url}" style="background-color: #000000; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Verify Email
            </a>
          </div>
          <p style="font-size: 14px; line-height: 20px; color: #6b7280; margin-top: 0; margin-bottom: 8px;">
            If the button doesn't work, you can copy and paste the following link directly into your browser:
          </p>
          <p style="font-size: 14px; word-break: break-all; margin-top: 0; margin-bottom: 0;">
            <a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>
          </p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; line-height: 16px; color: #9ca3af; text-align: center; margin: 0;">
          If you didn't create a VectorMatch account, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error sending email:", error);
    throw error;
  }

  return data;
}

export async function sendAlreadyRegisteredEmail({
  email,
  signInUrl,
}: {
  email: string;
  signInUrl: string;
}) {
  if (isTestEmail(email)) {
    console.log("[test] skip sendAlreadyRegisteredEmail", email);
    return { id: "test-id" };
  }
  const { data, error } = await getResend().emails.send({
    from: "VectorMatch <onboarding@resend.dev>",
    to: email,
    subject: "You already have a VectorMatch account",
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111827; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: #111827; margin: 0;">VectorMatch</h1>
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; background-color: #fafafa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16px;">Account already exists</h2>
          <p style="font-size: 16px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
            Someone (hopefully you!) tried to sign up for a new VectorMatch account using this email address. However, you already have an active, verified account with us.
          </p>
          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${signInUrl}" style="background-color: #000000; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Sign In to Your Account
            </a>
          </div>
          <p style="font-size: 14px; line-height: 20px; color: #6b7280; margin-top: 0; margin-bottom: 0;">
            If you forgot your password, you can request a password reset on the sign-in page.
          </p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; line-height: 16px; color: #9ca3af; text-align: center; margin: 0;">
          If you didn't trigger this request, you can safely ignore this email. Your account remains fully secure.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error sending welcome back email:", error);
    throw error;
  }

  return data;
}

export async function sendResetPasswordEmail({
  email,
  url,
}: {
  email: string;
  url: string;
}) {
  if (isTestEmail(email)) {
    console.log("[test] skip sendResetPasswordEmail", email, url);
    return { id: "test-id" };
  }
  const { data, error } = await getResend().emails.send({
    from: "VectorMatch <onboarding@resend.dev>",
    to: email,
    subject: "Reset your password - VectorMatch",
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111827; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: #111827; margin: 0;">VectorMatch</h1>
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; background-color: #fafafa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16px;">Reset your password</h2>
          <p style="font-size: 16px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
            We received a request to reset the password for your VectorMatch account. You can reset your password by clicking the button below:
          </p>
          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${url}" style="background-color: #000000; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; line-height: 20px; color: #6b7280; margin-top: 0; margin-bottom: 8px;">
            This password reset link will expire in 1 hour. If the button doesn't work, you can copy and paste the following link directly into your browser:
          </p>
          <p style="font-size: 14px; word-break: break-all; margin-top: 0; margin-bottom: 0;">
            <a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>
          </p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; line-height: 16px; color: #9ca3af; text-align: center; margin: 0;">
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged and your account secure.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error sending reset password email:", error);
    throw error;
  }

  return data;
}
