import { SidebarInset } from "@/components/ui/sidebar";

interface DashboardMainProps {
  children: React.ReactNode;
}

/**
 * DashboardMain wraps the main content area of the dashboard.
 * SidebarInset is the content area that sits next to the sidebar (it's "inset" by the sidebar),
 * not the sidebar itself. The name is confusing but it's the correct shadcn/ui component for
 * the main content area in a sidebar layout.
 */
export function DashboardMain({ children }: DashboardMainProps) {
  return (
    <SidebarInset className="dashboard-surface min-h-svh">
      <div className="w-full max-w-5xl px-5 sm:px-8 lg:px-10">{children}</div>
    </SidebarInset>
  );
}
