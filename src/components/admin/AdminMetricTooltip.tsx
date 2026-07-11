// Admin Metric Tooltip — small info icon with hover explanation.
// Consistent with the tooltip pattern used in IngestionAnalytics and
// JobStalenessDistribution, but reusable across all admin dashboard cards.

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AdminMetricTooltipProps {
  text: string;
  className?: string;
}

export function AdminMetricTooltip({
  text,
  className,
}: AdminMetricTooltipProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info
            className={cn(
              "size-3.5 text-muted-foreground cursor-help shrink-0",
              className,
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs leading-relaxed">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
