import { Heart, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import {
  DatabaseGateIcon,
  GlobeScanIcon,
  GreenhouseIcon,
  LeverIcon,
  NetworkNodesIcon,
  ReasoningGateIcon,
  VectorGateIcon,
} from "./icons";

type Source = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
};

const SOURCES: Source[] = [
  {
    title: "Hacker News",
    subtitle: "Who is Hiring",
    icon: <span className="font-mono text-[13px] font-bold">HN</span>,
    iconBg: "#ff6600",
  },
  {
    title: "Greenhouse",
    subtitle: "ATS",
    icon: <GreenhouseIcon className="size-[21px]" />,
    iconBg: "#1f8a4c",
  },
  {
    title: "Lever",
    subtitle: "Opportunities",
    icon: <LeverIcon className="size-[21px]" />,
    iconBg: "#5840d8",
  },
  {
    title: "httparchive",
    subtitle: "Company Scans",
    icon: <GlobeScanIcon className="size-[21px]" />,
    iconBg: "#0ea5e9",
  },
  {
    title: "Hidden Channels",
    subtitle: "& Networks",
    icon: <NetworkNodesIcon className="size-[21px]" />,
    iconBg: "#7c3aed",
  },
];

type Gate = {
  num: number;
  icon: ReactNode;
  title: string;
  tag: string;
  body: string;
};

const GATES: Gate[] = [
  {
    num: 1,
    icon: <DatabaseGateIcon className="size-[26px]" />,
    title: "Database Filter",
    tag: "(GIN Index)",
    body: "Lightning-fast tag screening using advanced database indexing technology.",
  },
  {
    num: 2,
    icon: <VectorGateIcon className="size-[26px]" />,
    title: "Vector Search",
    tag: "(HNSW)",
    body: "Semantic similarity matching surfaces conceptually relevant opportunities.",
  },
  {
    num: 3,
    icon: <ReasoningGateIcon className="size-[26px]" />,
    title: "AI Reasoning",
    tag: "(gpt-4o-mini)",
    body: "Deep analysis ensures a perfect fit for your unique profile and goals.",
  },
];

type Match = {
  role: string;
  company: string;
  pay: string;
  liked: boolean;
};

const MATCHES: Match[] = [
  {
    role: "Senior Full Stack Dev",
    company: "Fintech Startup",
    pay: "$120k – $160k",
    liked: true,
  },
  {
    role: "Staff Engineer",
    company: "AI Platform",
    pay: "$150k – $200k",
    liked: false,
  },
  {
    role: "Tech Lead",
    company: "SaaS Company",
    pay: "$130k – $170k",
    liked: true,
  },
];

const PANEL =
  "relative z-1 overflow-hidden rounded-2xl border border-border bg-[oklch(0.20_0.026_274/0.55)] shadow-[0_18px_44px_oklch(0.10_0.02_274/0.4)] backdrop-blur-[10px]";
const PANEL_HEAD =
  "border-b border-border p-[18px] text-center font-mono text-xs tracking-[0.16em] uppercase text-muted-foreground";

export function HowItWorks() {
  return (
    <section
      id="how"
      className="how-surface relative border-t border-[oklch(0.30_0.03_274/0.5)] py-24 lg:py-26 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[linear-gradient(90deg,transparent,oklch(0.79_0.17_165/0.4),transparent)]"
    >
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-10">
        <div className="reveal mx-auto mb-16 max-w-[760px] text-center">
          <span className="font-mono text-[13px] font-medium tracking-[0.22em] uppercase text-accent">
            How it works
          </span>
          <h2 className="my-[18px] text-[clamp(32px,3.4vw,46px)] font-bold tracking-[-0.022em]">
            AI-Powered. Developer-Focused. Results-Driven.
          </h2>
          <p className="text-[17.5px] leading-relaxed text-muted-foreground">
            Our 3-Gate AI Pipeline ensures you only see opportunities that truly
            match your skills, preferences, and career goals.
          </p>
        </div>

        <div className="reveal-s relative grid items-start gap-8 lg:grid-cols-[256px_minmax(0,1fr)_280px]">
          {/* Animated connectors (desktop only) */}
          <svg
            className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible lg:block"
            viewBox="0 0 1000 360"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path className="flow-path" d="M150 180 H840" />
            <path
              className="flow-path"
              d="M120 180 C 150 110, 175 108, 205 108"
            />
            <path
              className="flow-path"
              d="M120 180 C 150 250, 175 252, 205 252"
            />
            <path
              className="flow-path"
              d="M790 180 C 825 112, 860 110, 895 110"
            />
            <path
              className="flow-path"
              d="M790 180 C 825 248, 860 250, 895 250"
            />
          </svg>

          {/* Sources */}
          <aside className={PANEL}>
            <div className={PANEL_HEAD}>Job Sources</div>
            {SOURCES.map((source) => (
              <div
                key={source.title}
                className="flex items-center gap-3.5 border-b border-[oklch(0.30_0.03_274/0.5)] px-[17px] py-[15px] last:border-b-0"
              >
                <span
                  className="grid size-[38px] flex-none place-items-center rounded-[10px] text-white"
                  style={{ background: source.iconBg }}
                >
                  {source.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold whitespace-nowrap">
                    {source.title}
                  </span>
                  <span className="block text-xs whitespace-nowrap text-muted-foreground">
                    {source.subtitle}
                  </span>
                </span>
              </div>
            ))}
          </aside>

          {/* Gates */}
          <div className="relative z-1 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GATES.map((gate) => (
              <article
                key={gate.num}
                className="group relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.205_0.026_274/0.62)] p-6 shadow-[0_18px_44px_oklch(0.10_0.02_274/0.4)] backdrop-blur-[10px] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1.5 hover:border-accent/45 hover:shadow-[0_26px_56px_#0007]"
              >
                <span className="absolute top-5 right-5 grid size-[34px] place-items-center rounded-full border border-accent/40 bg-accent/10 font-mono text-[15px] font-semibold text-accent">
                  {gate.num}
                </span>
                <div className="mb-[22px] grid size-[52px] place-items-center rounded-[14px] border border-accent/30 bg-accent/10 text-accent">
                  {gate.icon}
                </div>
                <h3 className="text-[17.5px] font-bold tracking-[-0.01em]">
                  {gate.title}
                  <small className="mt-[5px] block font-mono text-[12.5px] font-medium tracking-[0.02em] text-accent">
                    {gate.tag}
                  </small>
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {gate.body}
                </p>
              </article>
            ))}
          </div>

          {/* Matches */}
          <aside className={PANEL}>
            <div className={PANEL_HEAD}>Perfect Matches</div>
            <div className="flex flex-col gap-3 p-3.5">
              {MATCHES.map((match) => (
                <div
                  key={match.role}
                  className="group rounded-[13px] border border-border bg-[oklch(0.22_0.03_274/0.5)] px-[15px] py-3.5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold whitespace-nowrap">
                        {match.role}
                      </h4>
                      <div className="mt-0.5 text-xs whitespace-nowrap text-accent">
                        {match.company}
                      </div>
                    </div>
                    <Heart
                      className={
                        match.liked
                          ? "size-[17px] flex-none fill-primary-bright text-primary-bright"
                          : "size-[17px] flex-none text-faint"
                      }
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[11.5px] whitespace-nowrap text-muted-foreground">
                      {match.pay}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-accent">
                      <MapPin className="size-[13px]" />
                      Remote
                    </span>
                  </div>
                </div>
              ))}
              <div className="py-2 text-center text-[12.5px] text-faint">
                And more opportunities…
              </div>
            </div>
          </aside>
        </div>

        <div className="reveal mt-13 text-center">
          <span className="inline-block rounded-full border border-accent/25 bg-accent/[0.06] px-6 py-2.5 font-mono text-[14.5px] text-accent">
            Quality over quantity. Relevance over noise.
          </span>
        </div>
      </div>
    </section>
  );
}
