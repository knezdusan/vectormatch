"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";

export function ImpersonationIndicator() {
  const [isLoading, setIsLoading] = useState(false);

  const handleStop = async () => {
    setIsLoading(true);
    const { error } = await authClient.admin.stopImpersonating();
    setIsLoading(false);
    if (error) {
      toast.error(error.message || "Failed to stop impersonating");
    } else {
      toast.success("Returned to admin account");
      window.location.reload();
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleStop}
            disabled={isLoading}
            className="fixed bottom-4 left-4 z-50 flex items-center justify-center size-10 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Stop impersonating and return to admin account"
          >
            <Undo2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" align="center">
          <p>Stop impersonating</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
