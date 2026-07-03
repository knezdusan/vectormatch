import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/actions/auth";
import { BrandGlyph } from "@/components/public/home/icons";
import { Logo } from "@/components/public/home/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthSession } from "@/lib/auth";
import { DashboardSidebarNav } from "./DashboardSidebarNav";

function getInitials(name: string | null | undefined): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface DashboardSidebarProps {
  session: AuthSession;
  unreadCount?: number;
  mailUnreadCount?: number;
}

export function DashboardSidebar({
  session,
  unreadCount = 0,
  mailUnreadCount = 0,
}: DashboardSidebarProps) {
  if (!session) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="group-data-[collapsible=icon]:p-1">
        <div className="px-2 py-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <Logo className="group-data-[collapsible=icon]:hidden" />
          <div className="hidden group-data-[collapsible=icon]:flex justify-center w-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/">
                  <span className="grid size-9 flex-none place-items-center rounded-[11px] border border-primary-bright/50 bg-[linear-gradient(150deg,oklch(0.32_0.06_292),oklch(0.20_0.03_274))] text-primary-bright shadow-[0_0_24px_oklch(0.63_0.23_292/0.4),inset_0_0_12px_oklch(0.63_0.23_292/0.25)] transition-transform hover:scale-105">
                    <BrandGlyph className="size-5" />
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Home
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <DashboardSidebarNav
          role={session.user.role}
          unreadCount={unreadCount}
          mailUnreadCount={mailUnreadCount}
        />
      </SidebarContent>
      <SidebarFooter className="gap-3 pb-3">
        <div className="flex items-center justify-start gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="shrink-0">
            <AvatarImage src={session.user.image || ""} />
            <AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">
              {session.user.name || session.user.email}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {session.user.email}
            </span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={signOutAction} className="w-full">
              <SidebarMenuButton
                type="submit"
                tooltip="Sign out"
                className="btn-brand-outline w-full"
              >
                <LogOut className="size-4 shrink-0" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
