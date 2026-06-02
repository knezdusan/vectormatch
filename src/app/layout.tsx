import type { Metadata } from "next";
import { Geist, Geist_Mono, PT_Serif } from "next/font/google";
import "./globals.css";

const fontSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fontSerif = PT_Serif({
  variable: "--font-pt-serif",
  subsets: ["latin"],
  weight: "400",
});

const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VectorMatch — The AI Agent for Web Developers",
  description:
    "VectorMatch finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
