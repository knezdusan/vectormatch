"use client";

import {
  AlertTriangle,
  Check,
  CheckCheck,
  ExternalLink,
  Eye,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { markAllMatchesRead, updateMatchStatus } from "@/actions/matches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { StarRating } from "@/components/ui/star-rating";
import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import type { MatchRow } from "@/lib/jobs/dashboard-queries";
import {
  MATCH_SORT_OPTIONS,
  type MatchSortOption,
  type MatchStatusFilter,
} from "@/lib/jobs/match-filters";

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
    case "mismatch":
      return "destructive";
    case "pending":
    case "mark_read":
      return "secondary";
    case "applied":
      return "outline";
    case "stale":
      return "outline";
    default:
      return "outline";
  }
}

const STATUS_OPTIONS: { value: MatchStatusFilter; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "stale", label: "Closed" },
  { value: "pending", label: "Pending" },
  { value: "mark_read", label: "Read" },
  { value: "mismatch", label: "Mismatch" },
  { value: "applied", label: "Applied" },
  { value: "all", label: "All statuses" },
];

function statusLabel(status: string): string {
  switch (status) {
    case "mark_read":
      return "Read";
    case "mismatch":
      return "Mismatch";
    case "applied":
      return "Applied";
    case "stale":
      return "Closed";
    default:
      return status;
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

/**
 * Format the location + workplace type into a compact, human-readable label.
 * Examples: "Remote · San Francisco", "Hybrid · Warsaw", "Remote".
 */
function formatLocationLine(
  workplaceType: string | null,
  locationName: string | null,
): string | null {
  const parts: string[] = [];
  if (workplaceType && workplaceType.trim().length > 0) {
    parts.push(
      workplaceType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }
  if (locationName && locationName.trim().length > 0) {
    parts.push(locationName.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Choose the best description excerpt for the card.
 *
 * Prefer the AI-generated plain-text shortDescription. normalizedText is
 * already cleaned (HTML-stripped) by the normalizer, so we can use a tiny
 * plain-text fallback without pulling cheerio into the client bundle.
 */
function prepareDescriptionExcerpt(
  shortDescription: string | null,
  normalizedText: string | null,
  jobTitle: string,
): string | null {
  if (shortDescription && shortDescription.trim().length > 0) {
    return shortDescription.trim();
  }

  if (!normalizedText) return null;
  let text = normalizedText.trim();
  const title = jobTitle.trim();
  if (title.length > 0 && text.toLowerCase().startsWith(title.toLowerCase())) {
    text = text.slice(title.length).trimStart();
  }
  // Limit fallback length so a card with no summary never dominates the layout.
  return text.length > 0 ? text.slice(0, 360) : null;
}

// =============================================================================
// MATCH CARD
// =============================================================================

function MatchCard({ match }: { match: MatchRow }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "read" | "mismatch" | "applied" | null
  >(null);

  async function handleAction(
    action: "read" | "mismatch" | "applied",
    e: React.MouseEvent,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setPendingAction(action);
    const result =
      action === "read"
        ? await updateMatchStatus(match.matchQueueId, "mark_read")
        : await updateMatchStatus(
            match.matchQueueId,
            action === "mismatch" ? "mismatch" : "applied",
          );
    setPendingAction(null);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update match");
    }
  }

  const careerUrl = atsCareerUrl(match.jobAtsSource, match.jobAtsSlug);
  const descriptionExcerpt = prepareDescriptionExcerpt(
    match.jobShortDescription,
    match.jobNormalizedText,
    match.jobTitle,
  );

  return (
    <Link href={`/dashboard/jobs/${match.matchQueueId}`} className="block">
      <Card className="group relative p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
        {/* Unread indicator */}
        {!match.isRead && match.status === "approved" && (
          <span className="absolute top-4 right-4 size-2 rounded-full bg-accent" />
        )}

        <div className="flex flex-col gap-3">
          {/* Header: title + score + status */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium text-foreground">
                {match.jobTitle}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {match.jobAtsSource} · {match.jobAtsSlug}
              </p>
              {(() => {
                const locationLine = formatLocationLine(
                  match.jobWorkplaceType,
                  match.jobLocationName,
                );
                return locationLine ? (
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {locationLine}
                  </p>
                ) : null;
              })()}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StarRating score={match.matchScore} />
              <Badge variant={statusBadgeVariant(match.status)}>
                {statusLabel(match.status)}
              </Badge>
            </div>
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

          {/* Job description excerpt — context about the position itself */}
          {descriptionExcerpt && (
            <>
              <Separator />
              <p className="line-clamp-10 text-sm text-muted-foreground">
                {descriptionExcerpt}
              </p>
              <Separator />
            </>
          )}

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

          {/* Work authorization risk flag — warns the user to verify work
              authorization before applying. Surfaced when the JD was silent on
              work auth but the role is hybrid or single-country-remote. */}
          {match.workAuthRiskFlag && match.status === "approved" && (
            <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-500">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                Work authorization not verified — confirm eligibility before
                applying.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {match.status === "approved" && (
              <>
                {!match.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleAction("read", e)}
                    disabled={pendingAction !== null}
                    className="h-7 text-xs"
                  >
                    {pendingAction === "read" ? (
                      <Spinner className="size-3" />
                    ) : (
                      <>
                        <Eye className="size-3" />
                        Mark read
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleAction("mismatch", e)}
                  disabled={pendingAction !== null}
                  className="h-7 text-xs"
                >
                  {pendingAction === "mismatch" ? (
                    <Spinner className="size-3" />
                  ) : (
                    <>
                      <X className="size-3" />
                      Mismatch
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleAction("applied", e)}
                  disabled={pendingAction !== null}
                  className="h-7 text-xs"
                >
                  {pendingAction === "applied" ? (
                    <Spinner className="size-3" />
                  ) : (
                    <>
                      <Check className="size-3" />
                      Applied
                    </>
                  )}
                </Button>
              </>
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
  statusFilter: MatchStatusFilter;
  sortFilter: MatchSortOption;
  unreadCount: number;
  counts: Record<MatchStatusFilter, number>;
}

export function MatchList({
  matches,
  totalCount,
  currentPage,
  pageSize,
  statusFilter,
  sortFilter,
  unreadCount,
  counts,
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
    if (sortFilter !== "best_match") {
      params.set("sort", sortFilter);
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
        <div className="flex items-center gap-2">
          <SortSelect current={sortFilter} statusFilter={statusFilter} />
          <StatusFilterSelect
            current={statusFilter}
            counts={counts}
            sortFilter={sortFilter}
          />
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
                : statusFilter === "stale"
                  ? "No jobs were closed in the last 24 hours."
                  : `No ${statusLabel(statusFilter).toLowerCase()} matches found. Try a different filter.`}
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
// STATUS FILTER SELECT
// =============================================================================

function StatusFilterSelect({
  current,
  counts,
  sortFilter,
}: {
  current: MatchStatusFilter;
  counts: Record<MatchStatusFilter, number>;
  sortFilter: MatchSortOption;
}) {
  const router = useRouter();
  const currentOption = STATUS_OPTIONS.find(
    (option) => option.value === current,
  );

  function handleChange(value: string) {
    const params = new URLSearchParams();
    params.set("status", value);
    params.set("page", "1");
    if (sortFilter !== "best_match") {
      params.set("sort", sortFilter);
    }
    router.push(`/dashboard/jobs?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="w-44">
        <SelectValue>
          {currentOption?.label ?? statusLabel(current)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
            {counts[option.value] > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({counts[option.value]})
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// =============================================================================
// SORT SELECT
// =============================================================================

function SortSelect({
  current,
  statusFilter,
}: {
  current: MatchSortOption;
  statusFilter: MatchStatusFilter;
}) {
  const router = useRouter();
  const currentOption = MATCH_SORT_OPTIONS.find(
    (option) => option.value === current,
  );

  function handleChange(value: string) {
    const params = new URLSearchParams();
    params.set("sort", value);
    params.set("page", "1");
    if (statusFilter !== "approved") {
      params.set("status", statusFilter);
    }
    router.push(`/dashboard/jobs?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="w-40">
        <SelectValue>{currentOption?.label ?? current}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MATCH_SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
