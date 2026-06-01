import { ThemeProvider } from "@/components/custom/ThemeProvider";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      disableTransitionOnChange
    >
      <div className="bg-background text-foreground min-h-screen">
        {children}
      </div>
    </ThemeProvider>
  );
}
