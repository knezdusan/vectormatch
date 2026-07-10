import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design System | VectorMatch",
  description: "Internal design system documentation and component gallery",
  robots: { index: false, follow: false },
};

export default function ThemeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
