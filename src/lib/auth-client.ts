import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [adminClient()],
});

export const signIn = async (
  provider: "google" | "github" = "google",
  options?: { callbackURL?: string },
) => {
  const data = await authClient.signIn.social({
    provider,
    callbackURL: options?.callbackURL ?? "/dashboard/profile-management",
  });
  return data;
};
