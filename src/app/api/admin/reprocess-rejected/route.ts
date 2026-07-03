// Temporary endpoint — triggers a bulk reprocess that re-evaluates previously
// rejected jobs with the updated Gate 3 compliance directive.
//
// Usage: curl -X POST https://vectormatch.dev/api/admin/reprocess-rejected
//
// DELETE THIS FILE after the one-time reprocess is complete.

import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await inngest.send({
      id: `match-bulk-reprocess-rejected-${Date.now()}`,
      name: "match/bulk-reprocess",
      data: {
        personaId: null,
        includeRejected: true,
      },
    });
    return Response.json({
      success: true,
      message:
        "Bulk reprocess triggered with includeRejected=true. Check Inngest dashboard for progress.",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
