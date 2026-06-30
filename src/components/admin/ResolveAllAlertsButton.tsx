"use client";

import { CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { resolveAllAlertsAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface ResolveAllAlertsButtonProps {
  count: number;
}

export function ResolveAllAlertsButton({ count }: ResolveAllAlertsButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (count === 0) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await resolveAllAlertsAction();
        });
      }}
    >
      {isPending ? (
        "Resolving..."
      ) : (
        <>
          <CheckCheck className="size-3.5" />
          Resolve all ({count})
        </>
      )}
    </Button>
  );
}
