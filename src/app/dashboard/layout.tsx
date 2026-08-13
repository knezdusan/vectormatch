import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUnreadInboundCount } from "@/actions/mail";
import { DashboardLayout as DashboardLayoutComponent } from "@/components/dashboard/DashboardLayout";
import { DashboardMain } from "@/components/dashboard/DashboardMain";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { getAuthSession } from "@/lib/auth";
import { getUnreadBadgeCount } from "@/lib/jobs/dashboard-queries";
import { hasUnhealthySubscription } from "@/lib/subscriptions/health";

export const metadata: Metadata = {
  title: "Dashboard | VectorMatch",
  description: "Manage your job matching preferences and profile",
  robots: { index: false, follow: false },
};

async function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/auth?tab=signin");
  }

  // Fetch unread match count for the sidebar badge. Runs on every navigation
  // (Server Component re-renders). router.refresh() after mark-as-read actions
  // also triggers a re-fetch.
  const unreadCount = await getUnreadBadgeCount(session.user.id);
  // Fetch unread VM Mail count for the admin sidebar badge.
  const mailUnreadCount = await getUnreadInboundCount();
  // D30: Check subscription health for the sidebar danger indicator.
  // Cached for 1 hour via Cache Components — zero API calls on cache hit.
  // Only checked for admin users (non-admins don't see the Subscriptions tab).
  const subscriptionUnhealthy =
    session.user.role === "admin" ? await hasUnhealthySubscription() : false;

  return (
    <DashboardLayoutComponent session={session}>
      <DashboardSidebar
        session={session}
        unreadCount={unreadCount}
        mailUnreadCount={mailUnreadCount}
        subscriptionUnhealthy={subscriptionUnhealthy}
      />
      <DashboardMain>{children}</DashboardMain>
    </DashboardLayoutComponent>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="size-8" />
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
