"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInSchema, signUpSchema } from "@/db/schemas";
import { auth } from "@/lib/auth";

export type ActionState = {
  error: string;
  success: boolean;
  code?: string;
  email?: string;
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
      body: {
        ...parsed.data,
        callbackURL: "/dashboard",
      },
      headers: await headers(),
    });
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }

  return {
    error: "",
    success: true,
    code: "SIGNUP_SUCCESS",
    email: parsed.data.email,
  };
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
      if (err.body?.code === "EMAIL_NOT_VERIFIED") {
        return {
          error: "Your email address is not verified yet.",
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          email: parsed.data.email,
        };
      }
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }

  redirect("/dashboard");
}

export async function resendVerificationEmailAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get("email") as string;
  if (!email) {
    return { error: "Email is required", success: false };
  }

  try {
    await auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: "/dashboard",
      },
    });
    return {
      error: "",
      success: true,
      code: "RESEND_SUCCESS",
      email,
    };
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }
}

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get("email") as string;
  if (!email) {
    return { error: "Email is required", success: false };
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: `${process.env.BETTER_AUTH_URL}/auth/reset-password`,
      },
    });
    return {
      error: "",
      success: true,
      code: "RESET_REQUEST_SUCCESS",
      email,
    };
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }
}

export async function resetPasswordAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = formData.get("password") as string;
  const token = formData.get("token") as string;

  if (!password || !token) {
    return { error: "Password and token are required", success: false };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters", success: false };
  }

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: password,
        token,
      },
    });
    return {
      error: "",
      success: true,
      code: "RESET_PASSWORD_SUCCESS",
    };
  } catch (err) {
    if (isAPIError(err)) {
      return { error: err.message, success: false };
    }
    return { error: "An unexpected error occurred", success: false };
  }
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
