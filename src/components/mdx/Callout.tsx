import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

type CalloutVariant = "note" | "tip" | "warning";

const iconMap: Record<CalloutVariant, typeof Info> = {
  note: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
};

const colorMap: Record<CalloutVariant, string> = {
  note: "border-l-blue-500/60 bg-blue-500/10 text-blue-200",
  tip: "border-l-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  warning: "border-l-amber-500/60 bg-amber-500/10 text-amber-200",
};

export function Callout({
  variant = "note",
  children,
}: {
  variant?: CalloutVariant;
  children: ReactNode;
}) {
  const Icon = iconMap[variant];
  return (
    <aside className={`my-6 rounded-r-lg border-l-4 p-4 ${colorMap[variant]}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div className="text-sm leading-relaxed [&>p]:m-0">{children}</div>
      </div>
    </aside>
  );
}
