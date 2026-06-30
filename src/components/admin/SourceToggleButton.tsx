"use client";

// Source Toggle Button — Admin Dashboard (Sprint 4 — admin interactivity)
// src/components/admin/SourceToggleButton.tsx
//
// Client component that renders an Enable/Disable button for each source in
// the infrastructure health table. Uses useTransition to call the
// enableSourceAction or disableSourceAction Server Action without blocking
// the UI. The action calls revalidatePath, which triggers a server-side
// re-render of the InfrastructureHealth component.

import { Power, PowerOff } from "lucide-react";
import { useTransition } from "react";
import { disableSourceAction, enableSourceAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface SourceToggleButtonProps {
  sourceName: string;
  currentStatus: string;
}

export function SourceToggleButton({
  sourceName,
  currentStatus,
}: SourceToggleButtonProps) {
  const [isPending, startTransition] = useTransition();
  const isDisabled = currentStatus === "disabled";

  const label = isDisabled ? "Enable" : "Disable";
  const Icon = isDisabled ? Power : PowerOff;
  const variant = isDisabled ? "default" : "outline";

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          if (isDisabled) {
            await enableSourceAction(sourceName);
          } else {
            await disableSourceAction(sourceName);
          }
        });
      }}
    >
      {isPending ? (
        "..."
      ) : (
        <>
          <Icon className="size-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}
