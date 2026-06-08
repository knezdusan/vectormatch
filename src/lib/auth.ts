import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/db";

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
  },
  rateLimit: {
    enabled: true,
    window: 10, // 10-second window
    max: 100, // 100 requests per window (global)
    storage: "database", // Persist across server restarts

    customRules: {
      // Sensitive endpoints: 3 attempts per 10 seconds
      "/api/auth/sign-in/email": {
        window: 10,
        max: 3,
      },
      "/api/auth/sign-up/email": {
        window: 10,
        max: 3,
      },
      "/api/auth/reset-password": {
        window: 60,
        max: 3,
      },
      // Safe endpoints: no limit
      "/api/auth/get-session": false,
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: false,
    },
  },
});
