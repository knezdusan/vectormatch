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
//
// ── Lazy initialization (Module E — Coolify/Docker standalone deployment) ──
// The Pool is NOT created at module import time. During Next.js static
// generation (build time), every module in the import graph is loaded —
// including auth.ts → db.ts. Since DATABASE_URL is a runtime secret (not
// available at Docker build time), creating the Pool at module top-level
// crashes static generation with an opaque "digest" error on whichever page
// the worker was processing.
//
// Instead, `db` is exported as a Proxy that defers Pool creation until the
// first actual method call (db.select, db.insert, db.transaction, etc.).
// This means:
//   - The module can be imported freely during build — no DATABASE_URL needed.
//   - The Pool is only created when a live request triggers a query.
//   - No importer (auth.ts, Server Actions, Inngest handlers, etc.) needs to
//     change — the `db` export keeps the exact same Drizzle API surface.
//   - Better Auth's drizzleAdapter receives the Proxy and only triggers Pool
//     creation when it calls a db method during request handling (the adapter
//     does not eagerly access db at initialization time — verified).

import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schemas from "./schemas";

type Db = NeonDatabase<typeof schemas>;

let _db: Db | null = null;

/**
 * Lazily create the Drizzle + Neon Pool instance on first call.
 * DATABASE_URL is only read here — never at module import time.
 */
function getDb(): Db {
  if (_db) return _db;

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
  _db = drizzle(pool, {
    schema: schemas,
    logger: process.env.NODE_ENV === "development",
  });
  return _db;
}

/**
 * Lazy Proxy — the Drizzle API surface without creating the Pool at import.
 *
 * Method calls (db.select(), db.transaction(cb), …) are bound to the real
 * instance so `this` is correct. Non-function properties (db.query, db._)
 * are returned as-is from the real instance.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    if (typeof value === "function") {
      return value.bind(real);
    }
    return value;
  },
});
