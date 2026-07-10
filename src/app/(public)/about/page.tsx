import {
  ArrowRight,
  Cpu,
  Globe,
  Layers,
  Mail,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/blog/JsonLd";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About — VectorMatch",
  description:
    "VectorMatch is the AI agent for web developers. We built a 3-Gate matching funnel — GIN index overlap, HNSW vector similarity, and LLM arbitration — to surface hidden tech opportunities and help you pitch directly to decision makers.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
  openGraph: {
    title: "About — VectorMatch",
    description:
      "VectorMatch is the AI agent for web developers. We built a 3-Gate matching funnel — GIN index overlap, HNSW vector similarity, and LLM arbitration — to surface hidden tech opportunities and help you pitch directly to decision makers.",
    type: "website",
    url: `${SITE_URL}/about`,
  },
  twitter: {
    card: "summary_large_image",
    title: "About — VectorMatch",
    description:
      "VectorMatch is the AI agent for web developers. We use a 3-Gate matching funnel to surface hidden tech opportunities and help you pitch directly.",
  },
};

const VALUES = [
  {
    icon: Target,
    title: "Precision over volume",
    description:
      "We don't blast your CV to 500 companies. Our 3-Gate funnel surfaces the roles where your skillset genuinely overlaps — and tells you why.",
  },
  {
    icon: Shield,
    title: "Developer-first privacy",
    description:
      "Your CV is processed for matching, not sold to recruiters. GDPR-compliant by design, with automated processing transparency built in.",
  },
  {
    icon: Zap,
    title: "Speed through automation",
    description:
      "Inngest-powered pipelines poll Greenhouse, Lever, and Ashby continuously. New jobs are ingested, normalized, and matched within minutes.",
  },
  {
    icon: Globe,
    title: "Remote-first, global",
    description:
      "We index remote roles from companies hiring internationally. B2B contracting, W-8BEN compliance, and cross-border procurement are first-class concerns.",
  },
];

const PIPELINE = [
  {
    step: "Gate 1",
    title: "GIN Index Overlap",
    description:
      "PostgreSQL GIN indexes intersect your must-have tags with job requirements. If your React + TypeScript + Node stack doesn't overlap with the job's must-haves, it's filtered out in under 20ms.",
    icon: Layers,
  },
  {
    step: "Gate 2",
    title: "HNSW Vector Similarity",
    description:
      "Your persona embedding (built from your CV) is compared against the job's normalized text embedding using HNSW cosine distance. This catches semantic matches that keyword overlap misses.",
    icon: Cpu,
  },
  {
    step: "Gate 3",
    title: "LLM Arbitration",
    description:
      "GPT-4o evaluates the top candidates from Gate 2, producing a confidence score, reasoning, and a list of potential blockers. This is where nuanced fit decisions happen.",
    icon: Target,
  },
];

const aboutSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About VectorMatch",
  url: `${SITE_URL}/about`,
  description:
    "VectorMatch is the AI agent for web developers, using a 3-Gate matching funnel to surface hidden tech opportunities.",
  mainEntity: {
    "@type": "Organization",
    name: "VectorMatch",
    url: SITE_URL,
    description:
      "AI-powered job matching agent for web developers. Uses a 3-Gate funnel: GIN index overlap, HNSW vector similarity, and LLM arbitration.",
    slogan: "You focus on coding. VectorMatch handles the rest.",
    knowsAbout: [
      "AI job matching",
      "ATS integration",
      "Developer career optimization",
      "Remote job sourcing",
      "Vector similarity search",
    ],
  },
};

export default function AboutPage() {
  return (
    <main className="hero-aura relative min-h-screen overflow-x-clip">
      <JsonLd data={aboutSchema} />

      {/* Hero */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 pt-20 pb-14 sm:px-8 lg:px-10">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium text-accent backdrop-blur-md">
            About
          </span>
          <h1 className="mt-6 max-w-3xl font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            We built the tool we wished existed when we were job hunting.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            VectorMatch is the AI agent for web developers. It finds hidden tech
            opportunities, matches them with your unique developer profile, and
            helps you pitch directly to decision makers as a valued partner —
            not another resume in a pile of 500.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div>
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                The problem
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted-foreground">
                The best developer jobs aren't on LinkedIn. They're buried in
                ATS boards like Greenhouse, Lever, and Ashby — the same systems
                companies use to manage applications. The problem is that these
                boards are fragmented, unsearchable, and require you to manually
                check dozens of company career pages every day.
              </p>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted-foreground">
                Even when you find a good posting, you're competing against
                hundreds of applicants who all look the same on paper. The
                hiring team can't tell the difference between someone who used
                React once and someone who's been shipping with it for five
                years.
              </p>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                Our approach
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted-foreground">
                VectorMatch continuously ingests job postings from native ATS
                APIs, normalizes them into a unified schema, and runs each one
                through a 3-Gate matching funnel against your developer profile.
                The result is a ranked list of jobs where your skillset
                genuinely overlaps — with LLM reasoning explaining why.
              </p>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted-foreground">
                Instead of applying through a black-hole portal, you pitch
                directly to decision makers. We help you craft a message that
                positions you as a partner, not an applicant.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Gate Pipeline */}
      <section className="how-surface relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            The 3-Gate matching funnel
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
            Every job passes through three independent gates before it reaches
            your dashboard. Each gate filters more aggressively, so only the
            strongest matches survive.
          </p>

          <div className="mt-10 space-y-6">
            {PIPELINE.map((gate) => (
              <div
                key={gate.step}
                className="flex gap-5 rounded-xl border border-border bg-card/50 p-6"
              >
                <div className="flex size-12 flex-none items-center justify-center rounded-lg border border-primary-bright/30 bg-primary/10 text-primary-bright">
                  <gate.icon className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11.5px] tracking-[0.16em] uppercase text-faint">
                      {gate.step}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {gate.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                    {gate.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            What we value
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="rounded-xl border border-border bg-card/50 p-6"
              >
                <div className="flex size-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                  <value.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {value.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pitch-surface relative">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-primary/30 bg-primary/5 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                Ready to find your next role?
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Upload your CV and let the AI match engine rank your relevance
                score instantly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="btn-brand btn-pill">
                <Link href="/auth?tab=signup">
                  Get Started
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="btn-pill">
                <Link href="/contact">
                  <Mail className="size-4" />
                  Contact Us
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
