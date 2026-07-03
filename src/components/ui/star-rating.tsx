import { Star } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StarRatingProps {
  score: number;
  className?: string;
}

/**
 * 5-star rating where each half-star represents 10% of the score.
 * Score 0–100 maps to 0–5 stars in 0.5-star increments.
 */
export function StarRating({ score, className }: StarRatingProps) {
  // Clamp to 0–100, then round to nearest half-star.
  const clamped = Math.max(0, Math.min(100, score));
  const filledStars = Math.round(clamped / 10) / 2;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="img"
          className={`inline-flex items-center gap-0.5 ${className ?? ""}`}
          aria-label={`Match score: ${score} out of 100`}
        >
          {[1, 2, 3, 4, 5].map((index) => {
            const fill = Math.min(Math.max(filledStars - (index - 1), 0), 1);
            return (
              <div key={index} className="relative size-4">
                <Star className="size-4 text-muted-foreground/60" />
                {fill > 0 && (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${fill * 100}%` }}
                  >
                    <Star className="size-4 text-accent fill-accent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p className="font-medium">Match score: {score}/100</p>
        <p className="text-muted-foreground">{filledStars}/5 stars</p>
      </TooltipContent>
    </Tooltip>
  );
}
