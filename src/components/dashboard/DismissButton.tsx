"use client";

import { ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  DISMISS_REASONS,
  type DismissReason,
  dismissMatch,
} from "@/actions/matches";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

// Human-readable labels for each dismiss reason.
// Maps to the dismiss_reason PG enum.
const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  geo_fenced: "Geo-fenced",
  wrong_stack: "Wrong stack",
  too_senior: "Too senior",
  too_junior: "Too junior",
  not_development: "Not a dev role",
  not_interested: "Not interested",
  stale: "Stale / closed",
  duplicate: "Duplicate",
  other: "Other",
};

/**
 * Dismiss button with structured reason capture (D20 JOB 6.1).
 *
 * Replaces the old "Mismatch" button. When clicked, shows a dropdown of
 * dismiss reasons. The selected reason is persisted to match_queue.dismiss_reason
 * and feeds back into classifier improvement analytics.
 */
export function DismissButton({
  matchQueueId,
  disabled,
}: {
  matchQueueId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDismiss(reason: DismissReason) {
    setPending(true);
    const result = await dismissMatch(matchQueueId, reason);
    setPending(false);

    if (result.success) {
      toast.success(`Dismissed as ${DISMISS_REASON_LABELS[reason]}`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to dismiss match");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || pending}
          className="h-7 text-xs"
        >
          {pending ? (
            <Spinner className="size-3" />
          ) : (
            <>
              <X className="size-3" />
              Dismiss
              <ChevronDown className="size-3 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Dismiss reason
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DISMISS_REASONS.map((reason) => (
          <DropdownMenuItem
            key={reason}
            onClick={() => handleDismiss(reason)}
            className="text-xs"
          >
            {DISMISS_REASON_LABELS[reason]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
