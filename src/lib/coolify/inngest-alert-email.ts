// Inngest Alert Email — Diagnostics + acceptance criteria for Inngest issues
// src/lib/coolify/inngest-alert-email.ts
//
// Sends a detailed email to ADMIN_ALERT_EMAIL when the Inngest server
// is down, paused, or experiencing function failure spikes. The email
// includes full diagnostics, the reason for the alert, and clear
// acceptance criteria for resuming the Inngest server.
//
// If ADMIN_ALERT_EMAIL is not set, the function returns without sending.
// Resend failures are logged but not thrown.

import "server-only";

import type { InngestStatusResult } from "@/lib/coolify/client";
import type { InngestHealthReport } from "@/lib/coolify/inngest-health";
import { sendEmailViaResend } from "@/lib/mail";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_ALERT_EMAIL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type InngestAlertReason =
  | "server_unreachable"
  | "server_paused"
  | "function_failure_spike"
  | "pipeline_stall";

export interface InngestAlertEmailPayload {
  reason: InngestAlertReason;
  healthReport: InngestHealthReport;
  coolifyStatus: InngestStatusResult | null;
  dashboardUrl: string;
}

// ── Email Builder ────────────────────────────────────────────────────────────

function reasonTitle(reason: InngestAlertReason): string {
  switch (reason) {
    case "server_unreachable":
      return "Inngest server is unreachable";
    case "server_paused":
      return "Inngest server is paused";
    case "function_failure_spike":
      return "Inngest function failure spike detected";
    case "pipeline_stall":
      return "Inngest pipeline has stalled";
  }
}

function reasonDescription(reason: InngestAlertReason): string {
  switch (reason) {
    case "server_unreachable":
      return "The Inngest server health check failed. The server may be down, the container may have crashed, or the network may be blocking access. No background jobs will run until the server is restored.";
    case "server_paused":
      return "The Inngest server container has been stopped or exited. This may have been triggered manually, by a Coolify deployment, or by a resource constraint. No background jobs will run until the server is restarted.";
    case "function_failure_spike":
      return "The Inngest function failure rate exceeded 50% in the last hour. This indicates a systemic issue — likely a code bug, a database connectivity problem, or an external API outage affecting multiple functions.";
    case "pipeline_stall":
      return "No jobs have been normalized in the last 4 hours. This could mean the Inngest server is down, the normalization function is failing, or there are no jobs to process (check the job queue).";
  }
}

function acceptanceCriteria(reason: InngestAlertReason): string[] {
  switch (reason) {
    case "server_unreachable":
      return [
        "The Inngest health check endpoint returns HTTP 200",
        "The Inngest server container shows status 'running:healthy' in Coolify",
        "At least one Inngest function has completed successfully in the last 30 minutes",
      ];
    case "server_paused":
      return [
        "The Inngest server container is started via Coolify or the admin dashboard",
        "The Inngest server container shows status 'running:healthy' in Coolify",
        "The Inngest health check endpoint returns HTTP 200",
        "At least one Inngest function has completed successfully in the last 30 minutes",
      ];
    case "function_failure_spike":
      return [
        "The function failure rate drops below 10% for at least 1 hour",
        "The top failing functions are investigated and the root cause is fixed",
        "Any stuck or failed function runs are retried or cancelled from the Inngest dashboard",
      ];
    case "pipeline_stall":
      return [
        "At least 1 job is normalized within 30 minutes of the Inngest server being restored",
        "The normalizationRetrySweep function runs successfully (check Inngest dashboard)",
        "The unnormalized job backlog is decreasing (check admin dashboard → Pipeline tab)",
      ];
  }
}

function buildDiagnosticsTable(payload: InngestAlertEmailPayload): string {
  const { healthReport, coolifyStatus } = payload;
  const rows: string[] = [];

  // Coolify status
  if (coolifyStatus) {
    rows.push(`
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0;">Coolify status</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">${coolifyStatus.label} (${coolifyStatus.coolifyStatus})</td>
      </tr>`);
    if (coolifyStatus.error) {
      rows.push(`
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0;">Coolify API error</td>
          <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 600;">${coolifyStatus.error}</td>
        </tr>`);
    }
  }

  // Health check
  rows.push(`
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px 0;">Health check reachable</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${healthReport.healthCheck.reachable ? "#16a34a" : "#dc2626"};">${healthReport.healthCheck.reachable ? "Yes" : "No"}</td>
    </tr>`);
  if (healthReport.healthCheck.statusCode !== null) {
    rows.push(`
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0;">Health check status code</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">${healthReport.healthCheck.statusCode}</td>
      </tr>`);
  }
  if (healthReport.healthCheck.error) {
    rows.push(`
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0;">Health check error</td>
        <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 600;">${healthReport.healthCheck.error}</td>
      </tr>`);
  }

  // Function failures
  rows.push(`
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px 0;">Function runs (1h)</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600;">${healthReport.functionFailures.totalRuns}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px 0;">Failed runs (1h)</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${healthReport.functionFailures.failedRuns > 0 ? "#dc2626" : "#16a34a"};">${healthReport.functionFailures.failedRuns}</td>
    </tr>`);
  if (healthReport.functionFailures.totalRuns > 0) {
    rows.push(`
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0;">Failure rate</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${healthReport.functionFailures.failureRate >= 0.5 ? "#dc2626" : "#16a34a"};">${(healthReport.functionFailures.failureRate * 100).toFixed(0)}%</td>
      </tr>`);
  }
  if (healthReport.functionFailures.topFailingFunctions.length > 0) {
    const topFns = healthReport.functionFailures.topFailingFunctions
      .map((f) => `${f.name} (${f.failures})`)
      .join(", ");
    rows.push(`
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0;">Top failing functions</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">${topFns}</td>
      </tr>`);
  }

  // Pipeline stall
  rows.push(`
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px 0;">Jobs normalized (${healthReport.pipelineStall.windowHours}h)</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${healthReport.pipelineStall.stalled ? "#dc2626" : "#16a34a"};">${healthReport.pipelineStall.jobsNormalizedInWindow}</td>
    </tr>`);

  return `<table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #374151; margin-bottom: 24px;">${rows.join("")}</table>`;
}

function buildAcceptanceCriteriaList(reason: InngestAlertReason): string {
  const criteria = acceptanceCriteria(reason);
  const items = criteria
    .map((c) => `<li style="margin-bottom: 8px; padding-left: 8px;">${c}</li>`)
    .join("");
  return `
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h3 style="font-size: 14px; font-weight: 700; color: #0369a1; margin-top: 0; margin-bottom: 12px;">Acceptance criteria for resuming</h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 20px; color: #0c4a6e;">${items}</ul>
    </div>`;
}

function buildActionsSection(payload: InngestAlertEmailPayload): string {
  const { reason, dashboardUrl } = payload;
  let actions = "";

  if (reason === "server_unreachable" || reason === "server_paused") {
    actions = `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 12px;">What to do</h3>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 20px; color: #374151;">
          <li style="margin-bottom: 8px;">Go to the <a href="${dashboardUrl}" style="color: #2563eb; text-decoration: underline;">VectorMatch admin dashboard</a> → Pipeline tab</li>
          <li style="margin-bottom: 8px;">Check the Inngest server status indicator</li>
          <li style="margin-bottom: 8px;">Click "Resume" to start the Inngest server, or restart it from the Coolify dashboard</li>
          <li style="margin-bottom: 8px;">Wait 5 minutes and verify the status indicator turns green</li>
          <li style="margin-bottom: 8px;">Check that jobs are being normalized again (Pipeline tab → Pipeline Status)</li>
        </ol>
      </div>`;
  } else if (reason === "function_failure_spike") {
    actions = `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 12px;">What to do</h3>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 20px; color: #374151;">
          <li style="margin-bottom: 8px;">Check the Inngest dashboard for failed function runs and their error messages</li>
          <li style="margin-bottom: 8px;">Identify the root cause — common causes: database connectivity issues, OpenAI API outages, rate limiting, code bugs in recently deployed functions</li>
          <li style="margin-bottom: 8px;">Fix the root cause and redeploy if needed</li>
          <li style="margin-bottom: 8px;">Retry or cancel stuck function runs from the Inngest dashboard</li>
          <li style="margin-bottom: 8px;">Monitor the failure rate for 1 hour to confirm it drops below 10%</li>
        </ol>
      </div>`;
  } else {
    actions = `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 12px;">What to do</h3>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 20px; color: #374151;">
          <li style="margin-bottom: 8px;">Check if the Inngest server is running (admin dashboard → Pipeline tab)</li>
          <li style="margin-bottom: 8px;">If the server is running, check the Inngest dashboard for failed normalization runs</li>
          <li style="margin-bottom: 8px;">Verify there are unnormalized jobs in the queue (admin dashboard → Pipeline tab → Pipeline Status)</li>
          <li style="margin-bottom: 8px;">If jobs exist but aren't being processed, restart the Inngest server</li>
          <li style="margin-bottom: 8px;">Monitor the pipeline for 30 minutes to confirm jobs are being normalized</li>
        </ol>
      </div>`;
  }

  return actions;
}

function buildEmailHtml(payload: InngestAlertEmailPayload): string {
  const { reason, healthReport } = payload;
  const isCritical =
    reason === "server_unreachable" || reason === "server_paused";
  const statusColor = isCritical ? "#dc2626" : "#ca8a04";
  const statusLabel = isCritical ? "CRITICAL" : "WARNING";

  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111827; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: #111827; margin: 0;">VectorMatch</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; background-color: #fafafa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; color: #ffffff; background-color: ${statusColor}; font-size: 12px; font-weight: 700; margin-bottom: 16px;">
          ${statusLabel}
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16px;">${reasonTitle(reason)}</h2>
        <p style="font-size: 16px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
          ${reasonDescription(reason)}
        </p>
        <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 12px;">Diagnostics</h3>
        ${buildDiagnosticsTable(payload)}
        ${buildActionsSection(payload)}
        ${buildAcceptanceCriteriaList(reason)}
        <p style="font-size: 14px; line-height: 20px; color: #6b7280; margin-top: 0; margin-bottom: 0;">
          This alert was generated by the VectorMatch Inngest health monitor at ${healthReport.healthCheck.checkedAt}.
        </p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
      <p style="font-size: 12px; line-height: 16px; color: #9ca3af; text-align: center; margin: 0;">
        VectorMatch Inngest Health Monitor — automated alert
      </p>
    </div>
  `;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Send an Inngest alert email to the configured admin address.
 *
 * Returns whether an email was actually sent. If ADMIN_ALERT_EMAIL is not
 * configured, returns false without error.
 */
export async function sendInngestAlertEmail(
  payload: InngestAlertEmailPayload,
): Promise<boolean> {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    console.warn(
      "[inngest-alert] ADMIN_ALERT_EMAIL not set — skipping email notification",
    );
    return false;
  }

  const to = recipients.join(", ");
  const subject = `[VectorMatch] ${reasonTitle(payload.reason)}`;

  const result = await sendEmailViaResend({
    to,
    subject,
    html: buildEmailHtml(payload),
  });

  if (!result.success) {
    console.error("Failed to send Inngest alert email:", result.error);
    return false;
  }

  console.log(`Inngest alert email sent to ${to} (${payload.reason})`);
  return true;
}
