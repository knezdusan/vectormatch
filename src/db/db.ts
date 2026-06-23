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
//
// Module C connection strategy (MODULE_C_DECISIONS.md §7):
//   - Pooler URL required: the Neon `-pooler` hostname runs PgBouncer in
//     transaction mode, multiplexing up to 10,000 client connections over a
//     smaller pool of real Postgres connections. This is essential under
//     Inngest fan-out (Gate 3 concurrency 15 + Module B poller concurrency 50).
//   - Pool `max: 20`: gives headroom for concurrent Inngest steps while the
//     pooler manages DB-side pressure. A smaller value (e.g. 5) would serialize
//     all DB access — the opposite of the goal. With the stateless step pattern
//     (§6.4), connections are acquired/released at step boundaries, not held
//     across LLM calls.

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schemas from "./schemas";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Runtime guard (§7.1): a non-pooler URL risks connection exhaustion under
// concurrent Inngest fan-out. Warn loudly so a future misconfiguration is
// caught before it crashes production under Gate 3 fan-out.
if (!databaseUrl.includes("-pooler")) {
  console.warn(
    "DATABASE_URL does not use the Neon pooler endpoint — " +
      "connection exhaustion risk under concurrent Inngest fan-out",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 20 });
export const db = drizzle(pool, {
  schema: schemas,
  logger: process.env.NODE_ENV === "development",
});
