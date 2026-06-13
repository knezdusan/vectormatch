import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { getAuthSession } from "@/lib/auth";

async function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/auth");
  }

  return <DashboardSidebar session={session}>{children}</DashboardSidebar>;
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
