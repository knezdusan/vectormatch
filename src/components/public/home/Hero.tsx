import { ArrowRight, Play, Sparkles } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlobeScanIcon, GreenhouseIcon, LeverIcon } from "./icons";

const AVATAR_IMAGES = [
  "/avatars/dev-1.jpg",
  "/avatars/dev-2.jpg",
  "/avatars/dev-3.jpg",
  "/avatars/dev-4.jpg",
  "/avatars/dev-5.jpg",
];

type FloatCardData = {
  title: string;
  subtitle: string;
  position: string;
  icon?: ReactNode;
  iconBg?: string;
  avatar?: string;
  avatarImg?: string;
  online?: boolean;
  onlineOutline?: boolean;
};

const SOURCE_CARDS: FloatCardData[] = [
  {
    title: "Hacker News",
    subtitle: "Who is Hiring",
    position: "top-[4%] left-1 lg:-left-[-10px]",
    icon: <span className="font-mono text-[13px] font-bold">HN</span>,
    iconBg: "#ff6600",
  },
  {
    title: "Greenhouse",
    subtitle: "ATS Jobs",
    position: "top-[27%] left-1 lg:-left-[18px]",
    icon: <GreenhouseIcon className="size-[19px]" />,
    iconBg: "#1f8a4c",
  },
  {
    title: "Lever",
    subtitle: "Opportunities",
    position: "top-[50%] left-1 lg:-left-[34px]",
    icon: <LeverIcon className="size-[19px]" />,
    iconBg: "#5840d8",
  },
  {
    title: "Hidden Boards",
    subtitle: "httparchive",
    position: "top-[73%] left-1 lg:-left-[-10px]",
    icon: <GlobeScanIcon className="size-[19px]" />,
    iconBg: "#0ea5e9",
  },
];

const PERSONA_CARDS: FloatCardData[] = [
  {
    title: "CTO",
    subtitle: "Fintech Startup",
    position: "top-[7%] right-1 lg:-right-[-20px]",
    avatarImg: "/avatars/cto-employer.jpg",
    onlineOutline: true,
  },
  {
    title: "Eng Manager",
    subtitle: "AI Company",
    position: "top-[30%] right-1 lg:-right-[40px]",
    avatarImg: "/avatars/eng-manager.jpg",
    online: true,
  },
  {
    title: "Tech Lead",
    subtitle: "SaaS Platform",
    position: "top-[53%] right-1 lg:-right-[22px]",
    avatarImg: "/avatars/persona-3.jpg",
    onlineOutline: true,
  },
  {
    title: "Founder",
    subtitle: "Web3 Startup",
    position: "top-[76%] right-1 lg:-right-[-20px]",
    avatarImg: "/avatars/founder.jpg",
    online: true,
  },
];

function FloatCard({ card }: { card: FloatCardData }) {
  return (
    <div
      className={cn(
        "absolute z-5 flex items-center gap-2.5 rounded-2xl border border-border-soft bg-[oklch(0.20_0.026_274/0.72)] px-[15px] py-[11px] shadow-[0_14px_34px_#0008] backdrop-blur-[14px]",
        card.position,
      )}
    >
      {card.avatarImg ? (
        <span className="size-8 flex-none overflow-hidden rounded-full">
          <Image
            src={card.avatarImg}
            alt={card.title}
            width={32}
            height={32}
            className="size-full object-cover"
          />
        </span>
      ) : card.avatar ? (
        <span
          className="size-8 flex-none rounded-full"
          style={{ background: card.avatar }}
        />
      ) : (
        <span
          className="grid size-[34px] flex-none place-items-center rounded-[9px] text-white"
          style={{ background: card.iconBg }}
        >
          {card.icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-px">
        <div className="text-[13.5px] leading-tight font-semibold whitespace-nowrap">
          {card.title}
        </div>
        <div className="hidden text-[11.5px] leading-tight whitespace-nowrap text-muted-foreground sm:block">
          {card.subtitle}
        </div>
      </div>
      {card.online && (
        <span className="ml-1 size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
      )}
      {card.onlineOutline && (
        <span className="ml-1 size-2 rounded-full border border-accent shadow-[0_0_8px_var(--accent)]" />
      )}
    </div>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="hero-aura relative overflow-hidden pt-10 pb-16 sm:pt-14 lg:pt-10 lg:pb-20"
    >
      <div className="pointer-events-none absolute inset-0 z-0 hero-aura" />

      <div className="relative z-1 mx-auto grid w-full max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-10 lg:px-10">
        {/* Copy */}
        <div className="mx-auto max-w-[640px] text-center lg:mx-0 lg:max-w-[600px] lg:text-left space-y-4">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium whitespace-nowrap text-accent backdrop-blur-md">
            <Sparkles className="size-3.5" />
            The AI Agent for Web Developers
          </span>

          <h1 className="mt-6 mb-6 text-[clamp(2rem,4.6vw,3rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance">
            Skip the gatekeepers.
            <br />
            <span className="text-gradient-brand">
              Get hired on your terms.
            </span>
          </h1>

          <p className="mx-auto max-w-[500px] text-[18.5px] leading-relaxed text-muted-foreground lg:mx-0">
            VectorMatch finds hidden tech opportunities, matches them with your
            unique developer profile, and helps you pitch directly to decision
            makers as a valued partner, not just another applicant.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-[18px] lg:justify-start">
            <Button asChild variant="brand" size="xl" className="max-sm:flex-1">
              <a href="/signup">
                Start Your AI Job Hunt
                <ArrowRight className="size-[18px]" />
              </a>
            </Button>
            <Button asChild variant="brandGhost" size="xl" className="px-1.5">
              <a href="#how">
                <span className="grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright">
                  <Play className="size-3 fill-current" />
                </span>
                See How It Works
              </a>
            </Button>
          </div>

          <div className="mt-12 inline-block">
            <div className="font-mono text-[11.5px] tracking-[0.2em] uppercase text-faint">
              Trusted by developers
            </div>
            <div className="mt-3.5 flex items-center justify-center gap-4 lg:justify-start">
              <div className="flex">
                {AVATAR_IMAGES.map((src, i) => (
                  <span
                    key={src}
                    className={cn(
                      "size-10 overflow-hidden rounded-full border-2 border-background shadow-[0_2px_8px_#0008]",
                      i > 0 && "-ml-3",
                    )}
                  >
                    <Image
                      src={src}
                      alt={`Developer ${i + 1}`}
                      width={40}
                      height={40}
                      className="size-full object-cover"
                    />
                  </span>
                ))}
                <span className="-ml-3 grid size-10 place-items-center rounded-full border-2 border-background bg-[oklch(0.30_0.04_292)] text-xs font-semibold text-white">
                  +2k
                </span>
              </div>
              <div className="text-left">
                <b className="block text-[15.5px] font-semibold">
                  2,000+ developers
                </b>
                <span className="text-sm text-muted-foreground">
                  found better opportunities
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Portal scene */}
        <div className="relative mx-auto h-[380px] w-full max-w-[620px] sm:h-[460px] lg:h-[600px] lg:max-w-none">
          <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_30px_80px_oklch(0.10_0.02_274/0.7),inset_0_0_0_1px_oklch(0.50_0.06_292/0.18)]">
            <Image
              src="/hero-portal-main.jpg"
              alt="Developer facing a glowing code portal"
              fill
              priority
              sizes="(max-width: 800px) 620px, 50vw"
              className="object-cover object-[50%_46%]"
            />
            <div className="pointer-events-none absolute inset-0 scene-vignette" />
          </div>

          {SOURCE_CARDS.map((card) => (
            <FloatCard key={card.title} card={card} />
          ))}
          {PERSONA_CARDS.map((card) => (
            <FloatCard key={card.title} card={card} />
          ))}

          <div className="absolute bottom-3.5 left-1/2 z-6 w-max -translate-x-1/2 text-center">
            <span className="block text-sm text-muted-foreground">
              You focus on coding.
            </span>
            <b className="mt-0.5 block text-[15px] font-semibold">
              VectorMatch handles the rest.
            </b>
          </div>
        </div>
      </div>
    </section>
  );
}
