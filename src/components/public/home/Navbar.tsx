"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "For Developers", href: "#pitch" },
  // { label: "For Companies", href: "/companies" },
  // { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "z-60 border-b border-transparent transition-[background,border-color,backdrop-filter] duration-300",
        scrolled &&
          "border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150",
      )}
    >
      <div className="mx-auto flex h-[78px] w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <Logo />

        <nav className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[15.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3.5">
          <a
            href="/auth?tab=signin"
            className="hidden rounded-[10px] border border-border px-[18px] py-2.5 text-[15.5px] font-medium transition-colors hover:bg-secondary/60 sm:inline-flex"
          >
            Log in
          </a>
          <Button asChild className="btn-brand btn-pill hidden sm:inline-flex">
            <a href="/auth?tab=signup">Get Started</a>
          </Button>
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-[11px] border border-border text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-5 py-4 sm:px-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2.5">
              <a
                href="/auth?tab=signin"
                className="rounded-[10px] border border-border px-4 py-2.5 text-center text-[15.5px] font-medium"
              >
                Log in
              </a>
              <Button asChild className="btn-brand btn-pill">
                <a href="/auth?tab=signup">Get Started</a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
