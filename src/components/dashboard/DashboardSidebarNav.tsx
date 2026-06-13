"use client";

import { Briefcase, FileText, Shield, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function DashboardSidebarNav({ role }: { role?: string | null }) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard/account", label: "Account", icon: User },
    { href: "/dashboard/cv", label: "CV", icon: FileText },
    { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  ];

  if (role === "admin") {
    items.push({ href: "/dashboard/admin", label: "Admin", icon: Shield });
  }

  return (
    <SidebarMenu className="gap-2 py-2">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <SidebarMenuItem
            key={item.href}
            className="group-data-[collapsible=icon]:pl-2 pl-4"
          >
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.label}
              className="group-data-[collapsible=icon]:rounded-full rounded-r-none"
            >
              <Link href={item.href}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
