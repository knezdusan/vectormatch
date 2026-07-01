// OpenAI diagnostic endpoint — admin only
// Returns whether OPENAI_API_KEY is present in the runtime environment and
// whether a minimal embedding call succeeds. This is a safe, non-destructive
// way to verify the key from the deployed container without exposing it.

import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type OpenAIDiagnosticResponse = {
  present: boolean;
  prefix: string;
  wellFormed: boolean;
  testCall: {
    success: boolean;
    error?: string;
  };
};

export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.OPENAI_API_KEY ?? "";
  const present = key.length > 0;
  const prefix = key.slice(0, 7);
  const wellFormed = prefix.startsWith("sk-");

  let testCall: OpenAIDiagnosticResponse["testCall"] = { success: false };

  if (present) {
    try {
      const { embeddings } = await embedMany({
        model: openai.embedding("text-embedding-3-small"),
        values: ["diagnostic ping"],
      });
      testCall = {
        success: embeddings.length === 1 && embeddings[0].length > 0,
      };
    } catch (error) {
      testCall = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return Response.json({
    present,
    prefix,
    wellFormed,
    testCall,
  });
}
