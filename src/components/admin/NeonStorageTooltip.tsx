"use client";

import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NeonStorageTooltipProps {
  neonPct: number;
  storageMb: number;
  storageLimit: number;
  storagePct: number;
}

export function NeonStorageTooltip({
  neonPct,
  storageMb,
  storageLimit,
  storagePct,
}: NeonStorageTooltipProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="block w-full text-left space-y-1">
            <Progress
              value={Math.min(neonPct * 100, 100)}
              className={cn(
                "h-2",
                neonPct >= 0.88
                  ? "**:data-[slot=progress-indicator]:bg-red-500"
                  : neonPct >= 0.8
                    ? "**:data-[slot=progress-indicator]:bg-yellow-500"
                    : "**:data-[slot=progress-indicator]:bg-emerald-500",
              )}
            />
            <p className="text-xs text-muted-foreground">
              {(neonPct * 100).toFixed(1)}% used (synthetic)
            </p>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="space-y-1">
            <p>Synthetic storage — what Neon enforces.</p>
            <p className="text-muted-foreground">
              pg_database_size: {storageMb.toFixed(0)} MB / {storageLimit} MB (
              {(storagePct * 100).toFixed(1)}%)
            </p>
            <p>Warning at 80%, ingestion halted at 88%.</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
