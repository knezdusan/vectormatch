"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInSchema, signUpSchema } from "@/db/schemas";
import { auth } from "@/lib/auth";

export type ActionState = {
  error: string;
  success: boolean;
} | null;

export async function signUpAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const data = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    callbackURL: "/dashboard",
  };

  const parsed = signUpSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, success: false };
  }

  try {
    await auth.api.signUpEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }

  redirect("/dashboard");
}

export async function signInAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const data = {
    email: formData.get("email"),
    password: formData.get("password"),
    callbackURL: "/dashboard",
  };

  const parsed = signInSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, success: false };
  }

  try {
    await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  await auth.api.signOut({
    headers: await headers(),
  });

  try {
    await auth.api.signOut({
      headers: await headers(),
    });
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }
  redirect("/");
}
