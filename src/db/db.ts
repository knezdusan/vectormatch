// Database client — self-hosted PostgreSQL (node-postgres driver)
// src/db/db.ts
//
// Uses `drizzle-orm/node-postgres` with a standard `pg` Pool (TCP driver).
// Migrated from Neon serverless to self-hosted Postgres on the VPS to
// eliminate Neon CU-hour/egress limits. The Drizzle API surface is identical
// across drivers — all existing queries (db.select, db.insert, db.query.*,
// db.transaction) continue to work unchanged.
//
// Connection strategy:
//   - Standard TCP connection to the self-hosted Postgres on the same VPS
//     (Docker network, sub-millisecond latency, no cold starts).
//   - Pool `max: 30`: matches the jobIngestedHandler concurrency (25) plus
//     headroom for concurrent gate3Evaluator (10) and sweep crons. With the
//     stateless step pattern, connections are acquired/released at step
//     boundaries, not held across LLM calls. Postgres max_connections=100
//     leaves ample headroom (30 app + 5 background + Coolify DB shares the
//     server but not the instance).
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

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schemas from "./schemas";

type Db = NodePgDatabase<typeof schemas>;

let _pool: Pool | null = null;
let _db: Db | null = null;

/**
 * Lazily create the pg Pool + Drizzle instance on first call.
 * DATABASE_URL is only read here — never at module import time.
 */
function getPool(): Pool {
  if (_pool) return _pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  _pool = new Pool({ connectionString: databaseUrl, max: 30 });
  return _pool;
}

function getDb(): Db {
  if (_db) return _db;

  const pool = getPool();
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

/**
 * Raw SQL tagged template — for ad-hoc queries that use tagged template
 * literals (e.g. in Inngest cron jobs). Returns rows directly.
 *
 * Usage:
 *   import { rawSql } from "@/db/db";
 *   const rows = await rawSql`SELECT * FROM job WHERE id = ${jobId}`;
 */
export async function rawSql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, any>[]> {
  const pool = getPool();
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  const result = await pool.query({ text, values: values as never[] });
  return result.rows as Record<string, any>[];
}
