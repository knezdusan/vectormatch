import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
};

export type LegalLayoutProps = {
  /** Eyebrow label shown above the title (e.g. "Legal", "Compliance") */
  eyebrow: string;
  /** Main page title */
  title: string;
  /** One-line description shown under the title */
  description: string;
  /** ISO date string for "last updated" */
  lastUpdated: string;
  /** Sections for the table of contents */
  sections: LegalSection[];
  /** Page body content */
  children: ReactNode;
};

/**
 * Shared layout shell for legal pages (/privacy, /terms, /compliance).
 * Inherits the (public) layout (Navbar + Footer) and renders a dark-first
 * branded header, a sticky table-of-contents sidebar on desktop, and a
 * long-form content column.
 */
export function LegalLayout({
  eyebrow,
  title,
  description,
  lastUpdated,
  sections,
  children,
}: LegalLayoutProps) {
  return (
    <main className="legal-surface relative min-h-screen overflow-x-clip">
      {/* Header */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 pt-20 pb-14 sm:px-8 lg:px-10">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium text-accent backdrop-blur-md">
            {eyebrow}
          </span>
          <h1 className="mt-6 font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {description}
          </p>
          <p className="mt-6 font-mono text-[12.5px] tracking-[0.06em] text-faint">
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      {/* Body: TOC sidebar + content */}
      <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
          {/* Sticky TOC — desktop only */}
          <aside className="hidden lg:block">
            <nav className="sticky top-8">
              <h2 className="mb-4 font-mono text-[11.5px] tracking-[0.16em] uppercase text-faint">
                Contents
              </h2>
              <ul className="space-y-2.5 border-l border-border-soft">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l-2 border-transparent py-0.5 pl-4 text-[14px] text-muted-foreground transition-colors hover:border-primary-bright hover:text-foreground"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <div className="legal-content max-w-none">{children}</div>
        </div>
      </div>
    </main>
  );
}

/* ── Content primitives ────────────────────────────────────── */

export function LegalSectionHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mb-4 mt-12 scroll-mt-24 font-serif text-2xl font-bold tracking-tight text-foreground first:mt-0"
    >
      {children}
    </h2>
  );
}

export function LegalSubHeading({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-3 mt-8 scroll-mt-24 text-lg font-semibold text-foreground"
    >
      {children}
    </h3>
  );
}

export function LegalP({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-[15.5px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function LegalUl({ children }: { children: ReactNode }) {
  return <ul className="mb-4 space-y-2 pl-1">{children}</ul>;
}

export function LegalLi({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 text-[15.5px] leading-relaxed text-muted-foreground">
      <span className="absolute top-[10px] left-0 size-1.5 rounded-full bg-primary-bright/70" />
      {children}
    </li>
  );
}

export function LegalStrong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export function LegalCallout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="my-6 rounded-xl border border-primary-bright/25 bg-primary/8 p-5">
      <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-primary-bright">
        <span className="grid size-5 place-items-center rounded-md border border-primary-bright/40 bg-primary/15 text-[11px]">
          !
        </span>
        {title}
      </div>
      <div className="text-[14.5px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
