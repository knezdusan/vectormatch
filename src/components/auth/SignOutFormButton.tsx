"use client";

import { useActionState } from "react";
import { signOutAction } from "@/actions/auth";
import { Button } from "../ui/button";

function signOutAdapter(
  _prevState: unknown,
  formData: FormData,
): Promise<void> {
  return signOutAction(formData);
}

export function SignOutFormButton({
  children,
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [, formAction, isPending] = useActionState(signOutAdapter, null);
  return (
    <form action={formAction}>
      <Button
        type="submit"
        variant={variant || "outline"}
        size={size || "lg"}
        className={className}
        {...props}
      >
        {children ?? (isPending ? "Signing out..." : "Sign out")}
      </Button>
    </form>
  );
}
