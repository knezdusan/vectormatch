"use client";

import { useActionState, useState } from "react";
import { resendVerificationEmailAction, signInAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/auth-client";
import { PasswordInput } from "./PasswordInput";

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(signInAction, null);
  const [resendState, resendAction, isResendPending] = useActionState(
    resendVerificationEmailAction,
    null,
  );
  const [isSocialPending, setIsSocialPending] = useState<
    "google" | "github" | null
  >(null);

  const handleSocialSignIn = async (provider: "google" | "github") => {
    setIsSocialPending(provider);
    try {
      await signIn(provider);
    } catch (error) {
      console.error(error);
      setIsSocialPending(null);
    }
  };

  const handleResend = () => {
    const formData = new FormData();
    formData.append("email", state?.email || "");
    resendAction(formData);
  };

  const isAnyPending = isPending || isSocialPending !== null;

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="ml-2">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          required
          disabled={isAnyPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="ml-2">
          Password
        </Label>
        <PasswordInput
          id="password"
          name="password"
          placeholder="Enter your password"
          required
          disabled={isAnyPending}
        />
      </div>

      {state?.code === "EMAIL_NOT_VERIFIED" ? (
        <div
          className="rounded-md bg-amber-500/15 border border-amber-500/30 p-4 text-sm text-amber-500 space-y-3"
          data-testid="unverified-alert"
        >
          <div className="flex items-start">
            <div className="shrink-0 pt-0.5">
              <svg
                className="h-4 w-4 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Warning Alert Icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="font-medium text-foreground">
                Email address not verified
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                You must verify your email address before you can log in.
              </p>
            </div>
          </div>
          <div className="pl-7">
            {resendState?.success ? (
              <p className="text-xs font-semibold text-emerald-500 flex items-center">
                <svg
                  className="h-3 w-3 mr-1 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <title>Check Icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Verification email resent! Please check your inbox.
              </p>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="link"
                  onClick={handleResend}
                  className="h-auto p-0 text-xs font-semibold text-primary hover:text-primary/90 underline"
                  disabled={isResendPending}
                >
                  {isResendPending ? (
                    <span className="flex items-center">
                      <Spinner className="mr-1 h-3 w-3" /> Sending...
                    </span>
                  ) : (
                    "Resend verification email"
                  )}
                </Button>
                {resendState?.error && (
                  <p className="mt-1 text-xs text-destructive">
                    {resendState.error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : state?.error ? (
        <div
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
          data-testid="error-alert"
        >
          {state.error}
        </div>
      ) : null}

      <Button type="submit" className="w-full my-4" disabled={isAnyPending}>
        {isPending ? "Signing in..." : "Sign In"}
      </Button>

      <div className="relative flex py-2 items-center">
        <div className="grow border-t border-border" />
        <span className="shrink mx-4 text-xs text-muted-foreground uppercase">
          Or continue with
        </span>
        <div className="grow border-t border-border" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn("google")}
          disabled={isAnyPending}
          className="w-full text-muted-foreground"
        >
          {isSocialPending === "google" ? (
            <Spinner className="mr-2" />
          ) : (
            <svg
              className="mr-2 h-4 w-4"
              aria-hidden="true"
              focusable="false"
              data-prefix="fab"
              data-icon="google"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 488 512"
            >
              <path
                fill="currentColor"
                d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
              />
            </svg>
          )}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn("github")}
          disabled={isAnyPending}
          className="w-full text-muted-foreground"
        >
          {isSocialPending === "github" ? (
            <Spinner className="mr-2 bg" />
          ) : (
            <svg
              className="mr-2 h-4 w-4"
              aria-hidden="true"
              focusable="false"
              data-prefix="fab"
              data-icon="github"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M12 .297c-6.63 0-11 5.373-11 12 0 5.303 3.438 9.8 8.205 11.385.5.09.682-.213.682-.477 0-.236-.008-.864-.011-1.69-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.517-1.303.958-1.602-2.665-.3-5.466-1.332-5.466-5.93 0-2.455.846-4.47 2.24-5.955-.23-.569-.97-2.854.213-5.864 0 0 1.88-.602 6.16 2.295a21.32 21.32 0 0 1 11 0c4.27-2.897 6.15-2.295 6.15-2.295 1.185 3.01.445 5.295.216 5.864 1.396 1.485 2.24 3.5 2.24 5.955 0 4.607-2.805 5.624-5.476 5.922.43.372.82 1.102.82 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-11-12"
              />
            </svg>
          )}
          GitHub
        </Button>
      </div>
    </form>
  );
}
