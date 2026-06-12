import { Suspense } from "react";
import { cn } from "@/lib/utils";
import Auth from "./Auth";
import { Logo } from "./home/Logo";
import MobMenu from "./MobMenu";

export type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: NavLink[] = [
  { label: "How it works", href: "/#how" },
  { label: "For Developers", href: "/#pitch" },
  // { label: "For Companies", href: "/companies" },
  // { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
];

export function Navbar() {
  return (
    <header
      className={cn(
        "z-60 border-b border-transparent transition-[background,border-color,backdrop-filter] duration-300",
        "border-t border-border",
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
          <Suspense fallback={<div>Loading...</div>}>
            <span className="hidden md:block">
              <Auth />
            </span>
          </Suspense>
          <MobMenu navLinks={NAV_LINKS}>
            <Auth />
          </MobMenu>
        </div>
      </div>
    </header>
  );
}
