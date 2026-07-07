// Tooltip Info Component
// src/components/jobs/TooltipInfo.tsx
//
// Small helper used throughout the public jobs page to explain UI elements
// to external users who are not familiar with the VectorMatch system.

"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipInfoProps {
  content: string;
}

export function TooltipInfo({ content }: TooltipInfoProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-help transition-colors">
            <Info className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
