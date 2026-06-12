import { createAuthClient } from "better-auth/react";

// fallow-ignore-next-line
export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});

export const signIn = async (provider: "google" | "github" = "google") => {
  const data = await authClient.signIn.social({
    provider,
    callbackURL: "/dashboard",
  });
  return data;
};
