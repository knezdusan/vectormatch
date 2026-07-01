"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { triggerBulkReprocessAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

/**
 * Admin dashboard button that triggers a bulk reprocess of the matching
 * pipeline. Sends a `match/bulk-reprocess` Inngest event that re-evaluates
 * all active+embedded jobs against all personas.
 *
 * This is the primary mechanism for retroactively matching existing jobs
 * after filter/prompt changes or when jobs were missed by the normal pipeline.
 */
export function BulkReprocessButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="default"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await triggerBulkReprocessAction(null);
            setResult(res);
          });
        }}
      >
        {isPending ? (
          "Triggering..."
        ) : (
          <>
            <RefreshCw className="size-3.5" />
            Run Bulk Reprocess
          </>
        )}
      </Button>
      {result && (
        <p
          className={`text-xs ${result.success ? "text-emerald-500" : "text-red-500"}`}
        >
          {result.success
            ? "Bulk reprocess triggered — check Inngest dashboard for progress."
            : `Error: ${result.error}`}
        </p>
      )}
    </div>
  );
}
