import {
  ArrowRight,
  FileText,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageSquare,
  Shield,
} from "lucide-react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/blog/JsonLd";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact — VectorMatch",
  description:
    "Get in touch with the VectorMatch team. Support, partnerships, press, and data privacy inquiries — we respond within 48 hours.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    title: "Contact — VectorMatch",
    description:
      "Get in touch with the VectorMatch team. Support, partnerships, press, and data privacy inquiries — we respond within 48 hours.",
    type: "website",
    url: `${SITE_URL}/contact`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact — VectorMatch",
    description:
      "Get in touch with the VectorMatch team. Support, partnerships, press, and data privacy inquiries.",
  },
};

const CONTACT_METHODS = [
  {
    icon: LifeBuoy,
    title: "General Support",
    email: "hello@vectormatch.dev",
    description:
      "Questions about your account, job matches, or how the platform works. We respond within 48 hours.",
  },
  {
    icon: Shield,
    title: "Privacy & Data",
    email: "privacy@vectormatch.dev",
    description:
      "GDPR data subject requests, deletion requests, or questions about how your CV data is processed.",
  },
  {
    icon: FileText,
    title: "Legal & Compliance",
    email: "legal@vectormatch.dev",
    description:
      "Contractor agreements, W-8BEN verification, procurement processes, and B2B invoicing questions.",
  },
  {
    icon: MessageSquare,
    title: "Partnerships",
    email: "hello@vectormatch.dev",
    description:
      "ATS integrations, API access, or if you're a company looking to source matched developers.",
  },
];

const FAQ = [
  {
    question: "How quickly will I get a response?",
    answer:
      "We respond to all inquiries within 48 hours during business days. For urgent privacy or data deletion requests, we aim to respond within 24 hours as required by GDPR.",
  },
  {
    question: "I want to delete my account and data. What do I do?",
    answer:
      "You can delete your account directly from the dashboard under Account Settings, or email privacy@vectormatch.dev and we'll process your request within 30 days as required by GDPR Article 17.",
  },
  {
    question:
      "I'm a company looking to hire developers. Can I use VectorMatch?",
    answer:
      "VectorMatch is currently built for developers seeking roles. If you're a company interested in sourcing matched candidates or integrating your ATS, reach out to hello@vectormatch.dev to discuss partnership options.",
  },
  {
    question: "Do you offer phone support?",
    answer:
      "We're a small team and operate asynchronously. Email is the best way to reach us — it gives us time to investigate your question thoroughly before responding.",
  },
];

const contactSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact VectorMatch",
  url: `${SITE_URL}/contact`,
  description:
    "Get in touch with the VectorMatch team for support, partnerships, press, and data privacy inquiries.",
  mainEntity: {
    "@type": "Organization",
    name: "VectorMatch",
    url: SITE_URL,
    email: "hello@vectormatch.dev",
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@vectormatch.dev",
        availableLanguage: ["English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "technical support",
        email: "hello@vectormatch.dev",
        availableLanguage: ["English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "billing support",
        email: "legal@vectormatch.dev",
        availableLanguage: ["English"],
      },
    ],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function ContactPage() {
  return (
    <main className="hero-aura relative min-h-screen overflow-x-clip">
      <JsonLd data={contactSchema} />
      <JsonLd data={faqSchema} />

      {/* Hero */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 pt-20 pb-14 sm:px-8 lg:px-10">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium text-accent backdrop-blur-md">
            Contact
          </span>
          <h1 className="mt-6 max-w-3xl font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Let's talk.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Whether you need help with your account, have a question about data
            privacy, or want to explore a partnership — we're here. Pick the
            right channel below and we'll get back to you within 48 hours.
          </p>
        </div>
      </section>

      {/* Contact methods */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-6 sm:grid-cols-2">
            {CONTACT_METHODS.map((method) => (
              <a
                key={method.title}
                href={`mailto:${method.email}`}
                className="group flex flex-col rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-primary-bright/30 bg-primary/10 text-primary-bright">
                    <method.icon className="size-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {method.title}
                  </h3>
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
                  {method.description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-[14px] font-medium text-primary-bright">
                  <Mail className="size-4" />
                  {method.email}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-6 text-primary-bright" />
            <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              Frequently asked questions
            </h2>
          </div>
          <div className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border border-border bg-card/50 p-6"
              >
                <h3 className="text-[15.5px] font-semibold text-foreground">
                  {item.question}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  {item.answer}
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
                Still have questions?
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Email us directly and we'll get back to you within 48 hours.
              </p>
            </div>
            <Button asChild className="btn-brand btn-pill">
              <a href="mailto:hello@vectormatch.dev">
                <Mail className="size-4" />
                Email Us
              </a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
