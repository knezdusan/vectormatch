import { Hero } from "@/components/public/home/Hero";
import { HowItWorks } from "@/components/public/home/HowItWorks";
import { Pitch } from "@/components/public/home/Pitch";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

export const metadata = {
  title: "VectorMatch — The AI Agent for Web Developers",
  description:
    "VectorMatch finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner.",
  alternates: {
    canonical: SITE_URL,
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "VectorMatch",
  url: SITE_URL,
  description:
    "The AI agent for web developers. Find hidden tech opportunities, match with your exact skillset, and pitch directly to decision makers.",
  publisher: {
    "@type": "Organization",
    name: "VectorMatch",
    url: SITE_URL,
  },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/jobs?search={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "VectorMatch",
  url: SITE_URL,
  description:
    "AI-powered job matching agent for web developers. Uses a 3-Gate funnel: GIN index overlap, HNSW vector similarity, and LLM arbitration.",
  slogan: "You focus on coding. VectorMatch handles the rest.",
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip">
      <JsonLd data={websiteSchema} />
      <JsonLd data={organizationSchema} />
      <Hero />
      <HowItWorks />
      <Pitch />
    </main>
  );
}
