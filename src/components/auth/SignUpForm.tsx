"use client";

import { useActionState, useState } from "react";
import { signUpAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/auth-client";
import { PasswordInput } from "./PasswordInput";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, null);
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

  const isAnyPending = isPending || isSocialPending !== null;

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="ml-2">
          Full Name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Enter your full name"
          required
          disabled={isAnyPending}
        />
      </div>

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
          placeholder="Create a password"
          required
          disabled={isAnyPending}
        />
        <p className="text-xs text-right text-muted-foreground">
          Must be at least 8 characters long
        </p>
      </div>

      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Button type="submit" className="w-full my-4" disabled={isAnyPending}>
        {isPending ? "Creating account..." : "Sign Up"}
      </Button>

      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-border" />
        <span className="flex-shrink mx-4 text-xs text-muted-foreground uppercase">
          Or continue with
        </span>
        <div className="flex-grow border-t border-border" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn("google")}
          disabled={isAnyPending}
          className="w-full"
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
          className="w-full"
        >
          {isSocialPending === "github" ? (
            <Spinner className="mr-2" />
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
