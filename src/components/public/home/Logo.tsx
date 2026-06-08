import { cn } from "@/lib/utils";
import { BrandGlyph } from "./icons";

export function Logo({ className }: { className?: string }) {
  return (
    <a
      href="/"
      className={cn(
        "flex items-center gap-2.5 text-[22px] font-bold tracking-tight",
        className,
      )}
    >
      <span className="grid size-9 flex-none place-items-center rounded-[11px] border border-primary-bright/50 bg-[linear-gradient(150deg,oklch(0.32_0.06_292),oklch(0.20_0.03_274))] text-primary-bright shadow-[0_0_24px_oklch(0.63_0.23_292/0.4),inset_0_0_12px_oklch(0.63_0.23_292/0.25)]">
        <BrandGlyph className="size-5" />
      </span>
      <span>
        Vector<span className="text-primary-bright">&bull;&bull;</span>Match
      </span>
    </a>
  );
}
