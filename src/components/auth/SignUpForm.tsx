"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "./PasswordInput";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, null);

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
          disabled={isPending}
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
          disabled={isPending}
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
          disabled={isPending}
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

      <Button type="submit" className="w-full my-4" disabled={isPending}>
        {isPending ? "Creating account..." : "Sign Up"}
      </Button>
    </form>
  );
}
