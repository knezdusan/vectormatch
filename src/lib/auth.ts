import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/db/db";
import { sendAlreadyRegisteredEmail, sendVerificationEmail } from "@/lib/email";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  plugins: [nextCookies()],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    onExistingUserSignUp: async ({ user }) => {
      // Background security flow to prevent user enumeration attacks while
      // sending the correct, high-UX follow-up email depending on verification state.
      if (user.emailVerified) {
        // Verified: send "Already registered - login here" link
        const signInUrl = `${process.env.BETTER_AUTH_URL}/auth?tab=signin`;
        await sendAlreadyRegisteredEmail({
          email: user.email,
          signInUrl,
        });
      } else {
        // Unverified: trigger a fresh, secure verification email to complete sign-up
        await auth.api.sendVerificationEmail({
          body: {
            email: user.email,
            callbackURL: "/dashboard",
          },
        });
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Better Auth defaults some verification links to /verify-email (signup/signin)
      // and others to /api/auth/verify-email (resend-verification).
      // We ensure it points directly to the API endpoint /api/auth/verify-email exactly once.
      let apiVerificationUrl = url;
      if (!url.includes("/api/auth/verify-email")) {
        apiVerificationUrl = url.replace(
          "/verify-email",
          "/api/auth/verify-email",
        );
      }
      await sendVerificationEmail({
        email: user.email,
        url: apiVerificationUrl,
      });
    },
  },
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  rateLimit: {
    enabled: true,
    window: 10, // 10-second window
    max: 100, // 100 requests per window (global)
    storage: "database", // Persist across server restarts

    customRules: {
      // Paths are relative to the Better Auth base (/api/auth is stripped).
      // The rate-limiter normalises the URL to the path after the basePath,
      // so "/api/auth/sign-in/email" becomes "/sign-in/email" internally.

      // Sensitive endpoints: 3 attempts per 10 seconds
      "/sign-in/email": {
        window: 10,
        max: 3,
      },
      "/sign-up/email": {
        window: 10,
        max: 3,
      },
      // Better Auth names this endpoint /request-password-reset
      "/request-password-reset": {
        window: 60,
        max: 3,
      },
      "/send-verification-email": {
        window: 60,
        max: 3,
      },
      // Safe endpoints: no rate limit (false = skip entirely)
      "/get-session": false,
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: false,
    },
  },
});

// Helper function to get the current session
export async function getAuthSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}
