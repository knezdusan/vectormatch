// Subscriptions Health Monitor — /dashboard/subscriptions
// src/app/dashboard/subscriptions/page.tsx
//
// Admin-only page that displays the health status of all paid SaaS services
// VectorMatch depends on. The health data is cached for 1 hour via Cache
// Components — the page renders instantly from cache, and the "Re-check now"
// button busts the cache for a fresh check.
//
// D30: Created after the OpenAI credit exhaustion outage (Aug 10-13 2026)
// that halted the entire matching pipeline for 4 days with no visible
// indicator in the admin dashboard.

import { ArrowLeft, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RecheckButton } from "@/components/admin/RecheckButton";
import { SubscriptionHealthList } from "@/components/admin/SubscriptionHealthList";
import { SubscriptionHealthSkeleton } from "@/components/admin/SubscriptionHealthSkeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Subscriptions | VectorMatch Admin",
  description: "Monitor paid SaaS service health and API credit status",
  robots: { index: false, follow: false },
};

export default async function SubscriptionsPage() {
  await requireRole("admin", "/dashboard");

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-5xl mx-auto w-full">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Admin
      </Link>

      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            Paid SaaS service health and API credit monitoring
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Health</CardTitle>
          <CardDescription>
            Checked every hour. Critical services can halt the entire app;
            medium services degrade specific features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <RecheckButton />
          </div>
          <Suspense fallback={<SubscriptionHealthSkeleton />}>
            <SubscriptionHealthList />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
