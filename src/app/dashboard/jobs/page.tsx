// Matched Jobs Dashboard — /dashboard/jobs
// src/app/dashboard/jobs/page.tsx
//
// Server Component that fetches matches from the 3-Gate funnel and renders
// the match list with status filter tabs. This is the primary calibration
// interface — cosine distance, overlap score, LLM confidence, and LLM
// reasoning are all visible on the cards.
//
// (MODULE_C_DECISIONS.md §8)

import { redirect } from "next/navigation";
import { MatchList, StatusFilterTabs } from "@/components/dashboard/MatchList";
import { getAuthSession } from "@/lib/auth";
import {
  getMatches,
  getMatchesCount,
  getUnreadBadgeCount,
} from "@/lib/jobs/dashboard-queries";

export const metadata = {
  title: "Matched Jobs | VectorMatch",
  description: "Review jobs matched to your personas by the 3-Gate funnel",
};

const PAGE_SIZE = 10;
const VALID_STATUSES = ["approved", "rejected", "pending", "all"] as const;
type StatusFilter = (typeof VALID_STATUSES)[number];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/auth?callbackUrl=%2Fdashboard%2Fjobs");
  }

  const userId = session.user.id;
  const params = await searchParams;

  // Parse query params
  const statusParam = params.status ?? "approved";
  const statusFilter: StatusFilter = VALID_STATUSES.includes(
    statusParam as StatusFilter,
  )
    ? (statusParam as StatusFilter)
    : "approved";
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Fetch data in parallel
  const [
    matches,
    totalCount,
    unreadCount,
    approvedCount,
    rejectedCount,
    pendingCount,
    allCount,
  ] = await Promise.all([
    getMatches(userId, statusFilter, PAGE_SIZE, offset),
    getMatchesCount(userId, statusFilter),
    getUnreadBadgeCount(userId),
    getMatchesCount(userId, "approved"),
    getMatchesCount(userId, "rejected"),
    getMatchesCount(userId, "pending"),
    getMatchesCount(userId, "all"),
  ]);

  const counts = {
    approved: approvedCount,
    rejected: rejectedCount,
    pending: pendingCount,
    all: allCount,
  };

  return (
    <div className="flex flex-col gap-6">
      <StatusFilterTabs current={statusFilter} counts={counts} />
      <MatchList
        matches={matches}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        statusFilter={statusFilter}
        unreadCount={unreadCount}
      />
    </div>
  );
}
