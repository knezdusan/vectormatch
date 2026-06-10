"use client";

import { use, useActionState } from "react";
import { resetPasswordAction } from "@/actions/auth";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type ResetPasswordFormProps = {
  searchParams: Promise<{ token?: string }>;
};

export function ResetPasswordForm({ searchParams }: ResetPasswordFormProps) {
  const { token } = use(searchParams);
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    null,
  );

  if (!token) {
    return (
      <main className="hero-aura pitch-surface min-h-screen flex items-center justify-center bg-background pb-4">
        <Card className="w-full max-w-md relative bottom-8">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-destructive">
              Invalid Request
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              No password reset token was provided. Please request a new
              password reset link.
            </p>
            <Button asChild className="w-full">
              <a href="/auth?tab=signin">Back to Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (state?.success) {
    return (
      <main className="hero-aura pitch-surface min-h-screen flex items-center justify-center bg-background pb-4">
        <Card className="w-full max-w-md relative bottom-8">
          <CardContent className="text-center space-y-6 py-10">
            <div className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 p-4">
              <svg
                className="h-10 w-10 text-emerald-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Success Icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Password Reset Successful</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Your password has been reset successfully. You can now sign in
                with your new password.
              </p>
            </div>
            <Button asChild className="w-full">
              <a href="/auth?tab=signin">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="hero-aura pitch-surface min-h-screen flex items-center justify-center bg-background pb-4">
      <Card className="w-full max-w-md relative bottom-8">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Reset Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <input type="hidden" name="token" value={token} />

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Create a new password"
                required
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            {state?.error && (
              <div
                className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
                data-testid="error-alert"
              >
                {state.error}
              </div>
            )}

            <Button type="submit" className="w-full my-4" disabled={isPending}>
              {isPending ? (
                <span className="flex items-center">
                  <Spinner className="mr-2 h-4 w-4" /> Resetting password...
                </span>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
