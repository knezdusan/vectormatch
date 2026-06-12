"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import type { NavLink } from "./Navbar";

export default function MobMenu({
  navLinks,
  children,
}: {
  navLinks: NavLink[];
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <div>
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="grid size-11 place-items-center rounded-[11px] border border-border text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {menuOpen && (
        <div className="hero-aura bg-background/95 backdrop-blur-md lg:hidden absolute top-20 left-0 right-0 z-50">
          <nav className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-5 py-4 sm:px-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border-b border-border px-3 py-2.5 text-[15.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2.5">{children}</div>
          </nav>
        </div>
      )}
    </>
  );
}
