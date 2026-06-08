import { Hero } from "@/components/public/home/Hero";
import { HowItWorks } from "@/components/public/home/HowItWorks";
import { Pitch } from "@/components/public/home/Pitch";

export const metadata = {
  title: "VectorMatch — The AI Agent for Web Developers",
  description:
    "VectorMatch finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner.",
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip">
      <Hero />
      <HowItWorks />
      <Pitch />
    </main>
  );
}
