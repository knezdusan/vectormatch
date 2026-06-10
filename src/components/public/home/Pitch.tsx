import {
  ArrowRight,
  Briefcase,
  Check,
  Globe,
  Heart,
  PenLine,
  Play,
  TrendingUp,
  User,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

const BENEFITS: { icon: ReactNode; label: string }[] = [
  {
    icon: <User className="size-5" />,
    label: "Direct access to decision makers",
  },
  {
    icon: <Briefcase className="size-5" />,
    label: "B2B contracts, not complex employment",
  },
  {
    icon: <Globe className="size-5" />,
    label: "Global opportunities, simplified",
  },
  {
    icon: <TrendingUp className="size-5" />,
    label: "Higher rates, better relationships",
  },
];

const TAGS = ["React", "TypeScript", "Node.js", "PostgreSQL"];

const COMPANIES = [
  {
    initial: "F",
    bg: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    name: "FintechFlow",
    meta: "Series B · 50–100 people",
    sub: "Building the future of financial infrastructure",
    match: "TechStack Match: 95%",
  },
  {
    initial: "A",
    bg: "linear-gradient(135deg,#0ea5e9,#22c55e)",
    name: "AI Labs",
    meta: "Series A · 20–50 people",
    sub: "AI-powered developer tools",
    match: "TechStack Match: 92%",
  },
];

const PARTNERSHIP = [
  "Higher compensation",
  "Flexible arrangements",
  "Global opportunities",
  "Long-term relationships",
];

const CARD =
  "rounded-2xl border border-border bg-[oklch(0.205_0.026_274/0.82)] shadow-[0_26px_64px_oklch(0.08_0.02_274/0.7)] backdrop-blur-[1px]";

function ProfileCard() {
  return (
    <div
      className={`${CARD} flex flex-col gap-3.5 p-[18px] xl:absolute xl:top-0 xl:left-0 xl:z-3 xl:w-[308px]`}
    >
      <div className="flex items-center gap-3.5">
        <span className="size-[54px] flex-none overflow-hidden rounded-[13px]">
          <Image
            src="/avatars/alex-webb.jpg"
            alt="Alex Chen"
            width={54}
            height={54}
            className="size-full object-cover"
          />
        </span>
        <div>
          <div className="text-lg font-bold">Alex Webb</div>
          <div className="text-[13.5px] text-muted-foreground">
            Senior Full Stack Developer
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TAGS.map((tag) => (
          <span
            key={tag}
            className="rounded-lg border border-border bg-[oklch(0.26_0.03_274/0.8)] px-[11px] py-1.5 font-mono text-xs"
          >
            {tag}
          </span>
        ))}
        <span className="rounded-lg border border-primary-bright/30 bg-primary/10 px-[11px] py-1.5 font-mono text-xs text-primary-bright">
          +8 more
        </span>
      </div>
    </div>
  );
}

function RecommendedCard() {
  return (
    <div
      className={`${CARD} p-4 xl:absolute xl:top-[200px] xl:left-0 xl:z-4 xl:w-[308px]`}
    >
      <div className="mx-1 mt-0.5 mb-3.5 text-sm font-semibold">
        Recommended Companies
      </div>
      <div className="flex flex-col gap-3">
        {COMPANIES.map((co) => (
          <div
            key={co.name}
            className="relative flex items-start gap-3.5 rounded-[13px] border border-border bg-[oklch(0.235_0.03_274/0.7)] px-3.5 pt-3.5 pb-4"
          >
            <span
              className="grid size-[42px] flex-none place-items-center rounded-[11px] font-mono font-bold text-white"
              style={{ background: co.bg }}
            >
              {co.initial}
            </span>
            <div>
              <div className="text-[15px] font-semibold">{co.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {co.meta}
              </div>
              <div className="mt-1.5 text-xs leading-snug text-faint">
                {co.sub}
              </div>
              <div className="mt-2 font-mono text-xs text-accent">
                {co.match}
              </div>
            </div>
            <Heart className="absolute top-3.5 right-3.5 size-[17px] text-faint" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnershipCard() {
  return (
    <div
      className={`${CARD} px-5 py-[18px] xl:absolute xl:top-[480px] xl:left-[100px] xl:z-5 xl:w-[244px] bg-primary/10`}
    >
      <h3 className="mb-3.5 text-[13.5px] font-bold">Partnership Benefits</h3>
      <ul className="grid gap-[11px]">
        {PARTNERSHIP.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground"
          >
            <Check
              className="size-[15px] flex-none text-accent"
              strokeWidth={2.4}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeCard() {
  return (
    <div
      className={`${CARD} p-[18px] xl:absolute xl:top-[150px] xl:right-0 xl:z-6 xl:w-80`}
    >
      <div className="mb-3.5 flex items-center gap-2.5 border-b border-border pb-3.5 text-[15px] font-bold">
        <PenLine className="size-[17px] text-primary-bright" />
        New Pitch
      </div>
      <div className="border-b border-[oklch(0.30_0.03_274/0.5)] py-2 text-[13px] text-muted-foreground">
        To:{" "}
        <span className="font-mono text-[12.5px] text-primary-bright">
          engineering@fintechflow.com
        </span>
      </div>
      <div className="border-b border-[oklch(0.30_0.03_274/0.5)] py-2 text-[13px] text-muted-foreground">
        Subject:{" "}
        <b className="font-semibold text-foreground">
          Senior Developer Partnership Opportunity
        </b>
      </div>
      <div className="my-[15px] grid gap-[11px] text-[13px] leading-relaxed text-muted-foreground">
        <span>Hi Sarah,</span>
        <span>
          I came across FintechFlow&apos;s work on modernizing financial
          infrastructure — impressive stuff.
        </span>
        <span>
          I&apos;d love to help accelerate your roadmap as a technical partner.
          I&apos;ve attached a brief overview of how I can contribute.
        </span>
        <span>Looking forward to hearing your thoughts.</span>
        <span>
          Best regards,
          <br />
          Alex
        </span>
      </div>
      <Button className="btn-brand btn-xl w-full">Send Pitch</Button>
    </div>
  );
}

export function Pitch() {
  return (
    <section
      id="pitch"
      className="pitch-surface relative overflow-clip border-t border-[oklch(0.30_0.03_274/0.5)] pt-15"
    >
      <div className="relative z-1 mx-auto grid w-full max-w-[1400px] gap-10 justify-center px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:pt-10">
        {/* Copy */}
        <div className="animate-pitch-left max-w-[640px]">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium whitespace-nowrap text-accent backdrop-blur-md">
            <ArrowRight className="size-3.5" />
            Bypass the ATS Black Hole
          </span>
          <h2 className="mt-6 mb-[22px] text-[clamp(2.5rem,4vw,3rem)] leading-[1.04] font-bold tracking-[-0.028em]">
            Pitch directly.
            <br />
            Partner effectively.
            <br />
            <span className="text-gradient-brand">Get contracted.</span>
          </h2>
          <p className="max-w-[470px] text-[17.5px] leading-relaxed text-muted-foreground">
            VectorMatch helps you connect directly with CTOs and Engineering
            Managers, positioning you as a strategic partner through
            frictionless B2B contracts.
          </p>
          <ul className="mt-8 grid gap-[18px]">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit.label}
                className="flex items-center gap-[15px] text-base"
              >
                <span className="grid size-[42px] flex-none place-items-center rounded-[11px] border border-primary-bright/30 bg-primary/10 text-primary-bright">
                  {benefit.icon}
                </span>
                {benefit.label}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-[18px]">
            <Button asChild className="btn-brand btn-xl max-sm:flex-1">
              <a href="/auth?tab=signup">
                Start Pitching Smarter
                <ArrowRight className="size-[18px]" />
              </a>
            </Button>
            <Button asChild className="btn-brand-ghost btn-xl px-1.5">
              <a href="/developers">
                <span className="grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright">
                  <Play className="size-3 fill-current" />
                </span>
                Learn More
              </a>
            </Button>
          </div>
        </div>

        {/* Visual collage */}
        <div className="animate-pitch-right relative mx-auto flex w-full max-w-[560px] flex-col gap-[18px] lg:max-w-[620px] xl:block xl:h-[824px] xl:max-w-none">
          <ProfileCard />
          <RecommendedCard />
          <PartnershipCard />
          <ComposeCard />
        </div>
      </div>
    </section>
  );
}
