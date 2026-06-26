"use client";

import { CheckCheck, ExternalLink, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { markAllMatchesRead, markMatchRead } from "@/actions/matches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import type { MatchRow } from "@/lib/jobs/dashboard-queries";

// =============================================================================
// HELPERS
// =============================================================================

function confidenceColor(confidence: number | null): string {
  if (confidence === null) return "text-muted-foreground";
  if (confidence >= 0.7) return "text-accent";
  if (confidence >= 0.4) return "text-yellow-500 dark:text-yellow-400";
  return "text-destructive";
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default";
    case "rejected":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

function atsCareerUrl(source: string, slug: string): string | null {
  const config = ATS_ENDPOINTS[source as keyof typeof ATS_ENDPOINTS];
  return config?.hostedBoard(slug) ?? null;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// MATCH CARD
// =============================================================================

function MatchCard({ match }: { match: MatchRow }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);

  async function handleMarkRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMarking(true);
    const result = await markMatchRead(match.matchQueueId);
    setMarking(false);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to mark as read");
    }
  }

  const careerUrl = atsCareerUrl(match.jobAtsSource, match.jobAtsSlug);

  return (
    <Link href={`/dashboard/jobs/${match.matchQueueId}`} className="block">
      <Card className="group relative p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
        {/* Unread indicator */}
        {!match.isRead && match.status === "approved" && (
          <span className="absolute top-4 right-4 size-2 rounded-full bg-accent" />
        )}

        <div className="flex flex-col gap-3">
          {/* Header: title + status */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium text-foreground">
                {match.jobTitle}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {match.jobAtsSource} · {match.jobAtsSlug}
              </p>
            </div>
            <Badge
              variant={statusBadgeVariant(match.status)}
              className="shrink-0"
            >
              {match.status}
            </Badge>
          </div>

          {/* Persona + ATS link */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Persona:{" "}
              <span className="text-foreground">{match.personaLabel}</span>
            </span>
            {careerUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(careerUrl, "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                View on ATS
              </button>
            )}
          </div>

          {/* Calibration metrics — the primary debugging interface */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Cosine dist</span>
              <p className="font-mono text-foreground">
                {match.cosineDistance?.toFixed(4) ?? "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Overlap</span>
              <p className="font-mono text-foreground">{match.overlapScore}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Confidence</span>
              <p
                className={`font-mono ${confidenceColor(match.llmConfidence)}`}
              >
                {match.llmConfidence !== null
                  ? match.llmConfidence.toFixed(2)
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Matched</span>
              <p className="text-foreground">{formatDate(match.createdAt)}</p>
            </div>
          </div>

          {/* LLM reasoning — the audit trail */}
          {match.llmReasoning && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {match.llmReasoning}
            </p>
          )}

          {/* Blockers (if rejected) */}
          {match.llmBlockers && match.llmBlockers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {match.llmBlockers.map((blocker) => (
                <Badge key={blocker} variant="destructive" className="text-xs">
                  {blocker}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {!match.isRead && match.status === "approved" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkRead}
                disabled={marking}
                className="h-7 text-xs"
              >
                {marking ? (
                  <Spinner className="size-3" />
                ) : (
                  <>
                    <Eye className="size-3" />
                    Mark read
                  </>
                )}
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground group-hover:text-primary">
              View details →
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// =============================================================================
// MATCH LIST
// =============================================================================

interface MatchListProps {
  matches: MatchRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  statusFilter: "approved" | "rejected" | "pending" | "all";
  unreadCount: number;
}

export function MatchList({
  matches,
  totalCount,
  currentPage,
  pageSize,
  statusFilter,
  unreadCount,
}: MatchListProps) {
  const router = useRouter();
  const [markingAll, setMarkingAll] = useState(false);

  const totalPages = Math.ceil(totalCount / pageSize);
  const hasMatches = matches.length > 0;
  const showMarkAllRead = unreadCount > 0 && statusFilter === "approved";

  async function handleMarkAllRead() {
    setMarkingAll(true);
    const result = await markAllMatchesRead();
    setMarkingAll(false);
    if (result.success) {
      toast.success(`Marked ${result.count} matches as read`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to mark all as read");
    }
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (statusFilter !== "approved") {
      params.set("status", statusFilter);
    }
    router.push(`/dashboard/jobs?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Matched Jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? "match" : "matches"}
            {unreadCount > 0 && ` · ${unreadCount} unread`}
          </p>
        </div>
        {showMarkAllRead && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            {markingAll ? (
              <Spinner className="size-4" />
            ) : (
              <>
                <CheckCheck className="size-4" />
                Mark all read
              </>
            )}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!hasMatches && (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <span className="text-2xl">📋</span>
          </div>
          <div>
            <h3 className="font-medium text-foreground">No matches yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter === "approved"
                ? "When the 3-Gate funnel finds jobs matching your personas, they'll appear here."
                : `No ${statusFilter} matches found. Try a different filter.`}
            </p>
          </div>
          <Link href="/dashboard/profile-management">
            <Button variant="outline" size="sm">
              Review your personas
            </Button>
          </Link>
        </Card>
      )}

      {/* Match cards */}
      {hasMatches && (
        <div className="flex flex-col gap-3">
          {matches.map((match) => (
            <MatchCard key={match.matchQueueId} match={match} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasMatches && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            ← Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STATUS FILTER TABS
// =============================================================================

const STATUS_TABS = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "pending", label: "Pending" },
  { value: "all", label: "All" },
] as const;

export function StatusFilterTabs({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  const router = useRouter();

  function handleTabChange(value: string) {
    const params = new URLSearchParams();
    params.set("status", value);
    params.set("page", "1");
    router.push(`/dashboard/jobs?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 border-b border-border pb-px">
      {STATUS_TABS.map((tab) => {
        const isActive = current === tab.value;
        const count = counts[tab.value] ?? 0;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({count})
              </span>
            )}
            {isActive && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
