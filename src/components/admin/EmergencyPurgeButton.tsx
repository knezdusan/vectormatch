"use client";

// Emergency Purge Button — Admin Dashboard (Sprint 8)
// src/components/admin/EmergencyPurgeButton.tsx
//
// Client component that renders a destructive "Emergency Purge" button on the
// infrastructure health card. Uses useTransition to call the
// triggerEmergencyPurgeAction Server Action, which sends a
// `purge/emergency-storage` event to the pg-boss scheduler.
//
// The button requires a confirmation dialog because the purge is irreversible
// — it deletes jobs from the database. A native confirm() is used for
// simplicity and to avoid adding a dialog dependency.

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { triggerEmergencyPurgeAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface EmergencyPurgeButtonProps {
  /** Current storage percentage (0–1). Button is highlighted when >= 0.8. */
  storagePercentage: number;
}

export function EmergencyPurgeButton({
  storagePercentage,
}: EmergencyPurgeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const isCritical = storagePercentage >= 0.88;
  const isWarning = storagePercentage >= 0.8 && !isCritical;

  const handleClick = () => {
    const confirmed = window.confirm(
      "This will permanently delete jobs from the database using a tiered purge strategy:\n\n" +
        "1. All normalization_failed jobs (no matching value)\n" +
        "2. All rejected jobs (garbage tombstones)\n" +
        "3. All gone jobs (permanently dead)\n" +
        "4. All stale jobs (not currently matched)\n" +
        "5. Oldest active jobs (LAST RESORT, excludes approved matches)\n\n" +
        "The purge stops when storage drops below 75%.\n\n" +
        "This action is IRREVERSIBLE. Continue?",
    );
    if (!confirmed) return;

    setResult(null);
    startTransition(async () => {
      const res = await triggerEmergencyPurgeAction();
      setResult(res);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant={isCritical ? "destructive" : "outline"}
        disabled={isPending}
        onClick={handleClick}
        className={
          isWarning && !isCritical
            ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
            : ""
        }
      >
        {isPending ? (
          "Purging..."
        ) : (
          <>
            <Trash2 className="size-3.5" />
            Emergency Purge
          </>
        )}
      </Button>
      {result?.success && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Purge triggered — check scheduler status for progress.
        </p>
      )}
      {result && !result.success && (
        <p className="text-xs text-destructive">
          {result.error ?? "Failed to trigger purge"}
        </p>
      )}
    </div>
  );
}
