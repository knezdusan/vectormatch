// Match Detail — /dashboard/jobs/[matchId]
// src/app/dashboard/jobs/[matchId]/page.tsx
//
// Full detail view for a single match. This is the primary calibration tool —
// shows the full job description, LLM reasoning, blockers, Gate 1+2 scores,
// persona context, and a link to the ATS career page.
//
// (MODULE_C_DECISIONS.md §8)

import { AlertTriangle, ArrowLeft, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DismissButton } from "@/components/dashboard/DismissButton";
import { MatchStatusSelect } from "@/components/dashboard/MatchStatusSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";
import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import { getMatchDetail } from "@/lib/jobs/dashboard-queries";
import { extractJobContent, extractJobUrl } from "@/lib/jobs/job-normalizer";
import { plainTextToDescriptionHtml } from "@/lib/jobs/sanitize-html";

export const metadata = {
  title: "Match Detail | VectorMatch",
  description: "Detailed view of a job match",
  robots: { index: false, follow: false },
};

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

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/auth?callbackUrl=%2Fdashboard%2Fjobs");
  }

  const { matchId } = await params;
  const match = await getMatchDetail(session.user.id, matchId);

  if (!match) {
    notFound();
  }

  // Prefer the persisted job-specific posting URL (set during normalization
  // before G7 nullifies rawJson). Fall back to the company-wide hosted board
  // URL when no per-job URL exists. For legacy jobs normalized before the
  // jobUrl column existed, use the applyUrl as a last resort.
  const hostedBoardUrl = ATS_ENDPOINTS[
    match.job.atsSource as keyof typeof ATS_ENDPOINTS
  ]?.hostedBoard(match.job.atsSlug);
  const jobUrl =
    match.job.jobUrl ??
    extractJobUrl(match.job.atsSource, match.job.rawJson) ??
    match.job.applyUrl ??
    hostedBoardUrl;

  // Build the best candidate-facing HTML we have. New jobs store
  // descriptionHtml. Legacy jobs may still carry rawJson (pre-G7) or only
  // normalizedText; we derive HTML from whichever source is available.
  let displayDescriptionHtml = match.job.descriptionHtml;
  if (!displayDescriptionHtml && match.job.rawJson) {
    const legacy = extractJobContent(
      match.job.atsSource,
      match.job.rawJson,
      match.job.title,
      null,
    );
    displayDescriptionHtml = legacy.htmlDescription;
  }
  if (!displayDescriptionHtml && match.job.normalizedText) {
    displayDescriptionHtml = plainTextToDescriptionHtml(
      match.job.normalizedText,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back navigation */}
      <Link href="/dashboard/jobs">
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowLeft className="size-4" />
          Back to matches
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground">
              {match.job.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {match.job.atsSource} · {match.job.atsSlug}
            </p>
          </div>
          <Badge
            variant={statusBadgeVariant(match.status)}
            className="shrink-0"
          >
            {statusLabel(match.status)}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-4">
          {jobUrl ? (
            <a
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit"
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer"
              >
                <ExternalLink className="size-4" />
                View on {match.job.atsSource}
              </Button>
            </a>
          ) : (
            <span />
          )}
          <MatchStatusSelect
            matchQueueId={match.matchQueueId}
            currentStatus={match.status}
          />
          <DismissButton matchQueueId={match.matchQueueId} />
        </div>
      </div>

      {/* D20 JOB 6.1 — Dismiss reason badge (if dismissed) */}
      {match.dismissReason && (
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs">
          <X className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Dismissed as</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {match.dismissReason.replace(/_/g, " ")}
          </Badge>
          {match.dismissedAt && (
            <span className="text-muted-foreground">
              on {match.dismissedAt.toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Gate 1+2 scores — calibration metrics */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Gate 1+2 Scores
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div>
            <span className="text-xs text-muted-foreground">
              Cosine distance
            </span>
            <p className="font-mono text-lg text-foreground">
              {match.cosineDistance?.toFixed(4) ?? "—"}
            </p>
            <span className="text-xs text-muted-foreground">
              lower = better
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Overlap score</span>
            <p className="font-mono text-lg text-foreground">
              {match.overlapScore}
            </p>
            <span className="text-xs text-muted-foreground">tag matches</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              LLM confidence
            </span>
            <p
              className={`font-mono text-lg ${confidenceColor(match.llmConfidence)}`}
            >
              {match.llmConfidence !== null
                ? match.llmConfidence.toFixed(2)
                : "—"}
            </p>
            <span className="text-xs text-muted-foreground">0.0–1.0</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Matched at</span>
            <p className="text-sm text-foreground">
              {formatDate(match.createdAt)}
            </p>
            <span className="text-xs text-muted-foreground">
              evaluated: {formatDate(match.evaluatedAt)}
            </span>
          </div>
        </div>
      </Card>

      {/* Gate 3 LLM verdict */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Gate 3 — LLM Arbitration
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Badge variant={statusBadgeVariant(match.status)}>
              {match.llmVerdict ?? "not evaluated"}
            </Badge>
            {match.llmConfidence !== null && (
              <span
                className={`text-sm font-mono ${confidenceColor(match.llmConfidence)}`}
              >
                confidence: {match.llmConfidence.toFixed(2)}
              </span>
            )}
            {match.llmModel && (
              <span className="text-xs text-muted-foreground">
                model: {match.llmModel}
              </span>
            )}
          </div>

          {match.llmReasoning && (
            <div>
              <span className="text-xs text-muted-foreground">Reasoning</span>
              <p className="mt-1 text-sm text-foreground">
                {match.llmReasoning}
              </p>
            </div>
          )}

          {match.llmBlockers && match.llmBlockers.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Blockers</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {match.llmBlockers.map((blocker) => (
                  <Badge
                    key={blocker}
                    variant="destructive"
                    className="text-xs"
                  >
                    {blocker}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {match.workAuthRiskFlag && match.status === "approved" && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-500">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Work authorization not verified</p>
                <p className="mt-0.5 text-xs">
                  The job description does not mention work authorization or
                  visa requirements, but the role is hybrid or restricted to a
                  specific country/region. Confirm your eligibility to work in
                  the required jurisdiction before applying — some employers
                  hide citizenship or permit requirements in the application
                  form.
                </p>
              </div>
            </div>
          )}

          {match.status === "pending" && (
            <p className="text-sm text-muted-foreground italic">
              This match is awaiting Gate 3 LLM evaluation.
            </p>
          )}
        </div>
      </Card>

      {/* Persona context */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Matched Persona
        </h2>
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-xs text-muted-foreground">Persona</span>
            <p className="text-sm font-medium text-foreground">
              {match.persona.personaLabel}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Summary</span>
            <p className="mt-0.5 text-sm text-foreground">
              {match.persona.embeddingSummary}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Must-have tags
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {match.persona.mustHaveTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Job description */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Job Description
        </h2>

        {/* Extracted tags */}
        {match.job.extractedTags && match.job.extractedTags.length > 0 && (
          <div className="mb-4">
            <span className="text-xs text-muted-foreground">
              Extracted tags
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {match.job.extractedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={`text-xs ${
                    match.persona.mustHaveTags.includes(tag)
                      ? "border-accent/50 text-accent"
                      : ""
                  }`}
                >
                  {tag}
                  {match.persona.mustHaveTags.includes(tag) && " ✓"}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Full description */}
        {displayDescriptionHtml ? (
          <div
            // biome-ignore lint: sanitized HTML from ATS job descriptions; scripts, event handlers, and non-semantic tags are stripped in sanitizeJobDescription.
            dangerouslySetInnerHTML={{
              __html: displayDescriptionHtml,
            }}
            className="text-sm text-foreground leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_em]:italic [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1"
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description available.
          </p>
        )}
      </Card>
    </div>
  );
}
