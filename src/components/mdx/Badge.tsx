import type { ReactNode } from "react";

type BadgeVariant = "greenhouse" | "lever" | "workday" | "default";

const variantStyles: Record<BadgeVariant, string> = {
  greenhouse: "bg-greenhouse/15 text-greenhouse border-greenhouse/30",
  lever: "bg-lever/15 text-lever border-lever/30",
  workday: "bg-workday/15 text-workday border-workday/30",
  default: "bg-muted text-muted-foreground border-border",
};

export function Badge({
  variant = "default",
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
        variantStyles[variant]
      }
    >
      {children}
    </span>
  );
}
