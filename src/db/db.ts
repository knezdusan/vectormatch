import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schemas from "./schemas";

const databaseUrl = process.env.DATABASE_URL;

// During Next.js static generation at build time, DATABASE_URL may not be
// available. We guard against this by checking NEXT_PHASE.
// See: https://nextjs.org/docs/app/api-reference/next-config-js/output
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" && !databaseUrl;

if (!databaseUrl && !isBuildTime) {
  throw new Error("DATABASE_URL environment variable is not set");
}

if (databaseUrl && !databaseUrl.includes("-pooler")) {
  console.warn(
    "DATABASE_URL does not use the Neon pooler endpoint — " +
      "connection exhaustion risk under concurrent Inngest fan-out",
  );
}

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 20 }) : null;

export const db = pool ? drizzle(pool, {
  schema: schemas,
  logger: process.env.NODE_ENV === "development",
}) : null as never;
