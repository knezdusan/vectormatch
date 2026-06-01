import { Footer } from "@/components/public/home/Footer";
import { Hero } from "@/components/public/home/Hero";
import { HowItWorks } from "@/components/public/home/HowItWorks";
import { Navbar } from "@/components/public/home/Navbar";
import { Pitch } from "@/components/public/home/Pitch";

export const metadata = {
  title: "Jobby — The AI Agent for Web Developers",
  description:
    "Jobby finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner.",
};

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Pitch />
      </main>
      <Footer />
    </div>
  );
}
