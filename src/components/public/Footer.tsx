import { Logo } from "./home/Logo";

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "For Developers", href: "/#pitch" },
      { label: "VectorMatch", href: "/#top" },
      // { label: "For Companies", href: "/companies" },
      // { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "About", href: "/about" },
      // { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "B2B Compliance", href: "/compliance" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-3 pt-16 pb-11">
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-10">
        <div className="flex flex-wrap justify-between gap-12 border-b border-border pb-11">
          <div className="max-w-80">
            <Logo />
            <p className="mt-[18px] text-[14.5px] leading-relaxed text-muted-foreground">
              The AI-powered job agent for web developers. Skip the gatekeepers,
              pitch directly, and get hired on your terms.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-[72px] gap-y-10">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h2 className="mb-[18px] font-mono text-[11.5px] tracking-[0.16em] uppercase text-faint">
                  {col.title}
                </h2>
                {col.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="mb-3 block text-[14.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-5 pt-[30px] text-[13.5px] text-faint">
          <span>
            © 2026 VectorMatch. You focus on coding. VectorMatch handles the
            rest.
          </span>
          <span>Built for developers, by developers.</span>
        </div>
      </div>
    </footer>
  );
}
