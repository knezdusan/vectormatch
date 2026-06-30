"use client";

import { LayoutGrid } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AdminDashboardTab {
  value: string;
  label: string;
}

interface AdminDashboardTabsProps {
  tabs: AdminDashboardTab[];
  defaultTab?: string;
  children: ReactNode;
}

export function AdminDashboardTabs({
  tabs,
  defaultTab,
  children,
}: AdminDashboardTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab =
    searchParams.get("tab") ?? defaultTab ?? tabs[0]?.value ?? "";

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/dashboard/admin?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="space-y-4"
    >
      <Card className="p-1">
        <TabsList className="w-full justify-start gap-1 bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-sm"
            >
              <LayoutGrid className="size-4 sm:hidden" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Card>

      {children}
    </Tabs>
  );
}
