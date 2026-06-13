import { ImpersonationIndicator } from "@/components/admin/ImpersonationIndicator";
import type { AuthSession } from "@/lib/auth";
import { DashboardSidebarProvider } from "./DashboardSidebarProvider";

interface DashboardLayoutProps {
  session: AuthSession | null;
  children: React.ReactNode;
}

export function DashboardLayout({ session, children }: DashboardLayoutProps) {
  return (
    <DashboardSidebarProvider>
      {children}
      {session?.session?.impersonatedBy ? <ImpersonationIndicator /> : null}
    </DashboardSidebarProvider>
  );
}
