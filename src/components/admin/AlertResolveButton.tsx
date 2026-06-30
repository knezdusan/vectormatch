"use client";

// Alert Resolve Button — Admin Dashboard (Sprint 4 — admin interactivity)
// src/components/admin/AlertResolveButton.tsx
//
// Client component that renders a "Resolve" button for each active alert.
// Uses useTransition to call the resolveAlertAction Server Action without
// blocking the UI. The action calls revalidatePath, which triggers a
// server-side re-render of the AlertsPanel.

import { Check } from "lucide-react";
import { useTransition } from "react";
import { resolveAlertAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface AlertResolveButtonProps {
  alertId: string;
}

export function AlertResolveButton({ alertId }: AlertResolveButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await resolveAlertAction(alertId);
        });
      }}
    >
      {isPending ? (
        "Resolving..."
      ) : (
        <>
          <Check className="size-3.5" />
          Resolve
        </>
      )}
    </Button>
  );
}
