// Recheck Button — busts the subscription health cache
// src/components/admin/RecheckButton.tsx
//
// Client Component. Calls the recheckSubscriptions Server Action which
// invalidates the "subscription-health" cache tag, causing the next read
// to re-run all health checks (OpenAI embedding ping, Resend API ping, etc.).

"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { recheckSubscriptions } from "@/actions/subscriptions";
import { Button } from "@/components/ui/button";

export function RecheckButton() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    recheckSubscriptions,
    null,
  );

  // After a successful recheck, refresh the page to show new results.
  // The cache was busted by revalidateTag in the server action, so the
  // Suspense boundary will re-fetch.
  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
        {isPending ? "Checking…" : "Re-check now"}
      </Button>
    </form>
  );
}
