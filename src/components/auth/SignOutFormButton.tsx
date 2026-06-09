"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { signOutAction } from "@/actions/auth";
import { Button } from "../ui/button";

export function SignOutFormButton({
  variant,
  size,
}: React.ComponentProps<typeof Button>) {
  const [state, formAction, isPending] = useActionState(signOutAction, null);
  if (state?.error) {
    toast.error(state.error);
  }
  return (
    <form action={formAction}>
      <Button type="submit" variant={variant || "outline"} size={size || "lg"}>
        {isPending ? "Signing out..." : "Sign out"}
      </Button>
    </form>
  );
}
