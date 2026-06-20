// Database client — Neon serverless (WebSocket Pool driver)
// src/db/db.ts
//
// Uses `drizzle-orm/neon-serverless` with a Neon `Pool` (WebSocket driver)
// instead of the HTTP `neon()` driver. The HTTP driver does NOT support
// transactions, which Module A requires for finalizeOnboardingAction and
// recomputeTagsExperience (MODULE_A_DECISIONS.md AR1). The Pool driver supports
// `db.transaction()` over a real PostgreSQL connection.
//
// All existing queries (db.select, db.insert, db.query.*) continue to work
// unchanged — only the underlying transport differs.

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schemas from "./schemas";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, {
  schema: schemas,
  logger: process.env.NODE_ENV === "development",
});
