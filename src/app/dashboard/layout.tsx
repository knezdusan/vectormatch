import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardLayout as DashboardLayoutComponent } from "@/components/dashboard/DashboardLayout";
import { DashboardMain } from "@/components/dashboard/DashboardMain";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { getAuthSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard | VectorMatch",
  description: "Manage your job matching preferences and profile",
};

async function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session) {
    const callbackUrl = encodeURIComponent(
      typeof window !== "undefined" ? window.location.pathname : "/dashboard",
    );
    redirect(`/auth?callbackUrl=${callbackUrl}`);
  }

  return (
    <DashboardLayoutComponent session={session}>
      <DashboardSidebar session={session} />
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
    <Suspense fallback={<Spinner className="size-8 block mx-auto" />}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
