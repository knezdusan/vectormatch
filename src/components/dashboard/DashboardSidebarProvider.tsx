"use client";

import { useEffect } from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

function MobileCollapseEffect() {
  const { isMobile, setOpen } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpen(false);
    }
  }, [isMobile, setOpen]);

  return null;
}

export function DashboardSidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <MobileCollapseEffect />
      {children}
    </SidebarProvider>
  );
}
