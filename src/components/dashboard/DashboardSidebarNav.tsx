"use client";

import {
  Briefcase,
  FileText,
  Newspaper,
  Shield,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function DashboardSidebarNav({ role }: { role?: string | null }) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard/account", label: "Account", icon: User },
    { href: "/dashboard/cv", label: "CV", icon: FileText },
    { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  ];

  const isAdminActive = pathname.startsWith("/dashboard/admin");

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

      {role === "admin" && (
        <SidebarMenuItem className="group-data-[collapsible=icon]:pl-2 pl-4">
          <SidebarMenuButton
            isActive={isAdminActive}
            tooltip="Admin"
            className="group-data-[collapsible=icon]:rounded-full rounded-r-none"
          >
            <Shield />
            <span>Admin</span>
          </SidebarMenuButton>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                asChild
                isActive={pathname === "/dashboard/admin/users"}
              >
                <Link href="/dashboard/admin/users">
                  <Users />
                  <span>Users</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                asChild
                isActive={pathname === "/dashboard/admin/blog"}
              >
                <Link href="/dashboard/admin/blog">
                  <Newspaper />
                  <span>Blog</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
