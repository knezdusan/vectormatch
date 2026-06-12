/**
 * Drizzle ↔ Better Auth schema compatibility tests.
 *
 * Better Auth reads the Drizzle schema at runtime and validates that every
 * column it needs is present. If a required column is missing, it logs an error
 * (or silently fails) — often only visible after the first real request hits
 * production.
 *
 * These tests verify the STRUCTURAL contract statically, before any code runs.
 * They are cheap (zero I/O, no mocks) and would have caught Bug 2 immediately:
 *   Bug 2: The `lastRequest` bigint column was missing from rateLimit.ts.
 *          Better Auth v1.6+ requires it for the sliding-window rate limiter.
 *          Without this test, the schema mismatch was only discovered from a
 *          runtime error logged to the server console in production.
 *
 * HOW TO KEEP THIS CURRENT
 * ─────────────────────────
 * When upgrading Better Auth, run `npx auth@latest generate` to see the
 * expected schema and cross-check it against the tables tested here.
 */

import { getTableColumns } from "drizzle-orm";
import { account } from "@/db/schemas/auth/account";
import { rateLimit } from "@/db/schemas/auth/rateLimit";
import { session } from "@/db/schemas/auth/session";
import { user } from "@/db/schemas/auth/user";

// ─── rateLimit table ──────────────────────────────────────────────────────────

describe("rateLimit schema — Better Auth v1.6+ contract", () => {
  const cols = Object.keys(getTableColumns(rateLimit));

  it("has 'key' primary key column", () => {
    expect(cols).toContain("key");
  });

  it("has 'count' column", () => {
    expect(cols).toContain("count");
  });

  // This is the column that was missing and caused Bug 2.
  // Better Auth v1.6 added sliding-window rate limiting which writes lastRequest
  // as Unix milliseconds (bigint) on every request. Without this column the DB
  // adapter throws BetterAuthError on every rate-limit write.
  it("has 'lastRequest' column (required by BA v1.6+ sliding-window algorithm)", () => {
    expect(cols).toContain("lastRequest");
  });

  it("lastRequest is a bigint column (Date.now() exceeds INTEGER max)", () => {
    const col = getTableColumns(rateLimit).lastRequest;
    // bigint({ mode: "number" }) sets dataType "number" but columnType "PgBigInt53".
    // PgInteger would be "PgInteger". The distinction matters: INTEGER max is ~2.1B
    // while Date.now() is ~1.75 * 10^12 and would silently overflow an integer column.
    expect(col.columnType).toBe("PgBigInt53");
  });
});

// ─── session table ────────────────────────────────────────────────────────────

describe("session schema — Better Auth contract", () => {
  const cols = Object.keys(getTableColumns(session));

  it("has all required Better Auth session columns", () => {
    const required = [
      "id",
      "expiresAt",
      "token",
      "userId",
      "createdAt",
      "updatedAt",
    ];
    for (const col of required) {
      expect(cols).toContain(col);
    }
  });

  it("has 'impersonatedBy' column (required by admin plugin)", () => {
    expect(cols).toContain("impersonatedBy");
  });
});

// ─── account table ────────────────────────────────────────────────────────────

describe("account schema — Better Auth contract", () => {
  const cols = Object.keys(getTableColumns(account));

  it("has all required Better Auth account columns", () => {
    const required = [
      "id",
      "accountId",
      "providerId",
      "userId",
      "password",
      "createdAt",
      "updatedAt",
    ];
    for (const col of required) {
      expect(cols).toContain(col);
    }
  });
});

// ─── user table ───────────────────────────────────────────────────────────────

describe("user schema — Better Auth contract", () => {
  const cols = Object.keys(getTableColumns(user));

  it("has all required Better Auth user columns", () => {
    const required = [
      "id",
      "name",
      "email",
      "emailVerified",
      "createdAt",
      "updatedAt",
    ];
    for (const col of required) {
      expect(cols).toContain(col);
    }
  });

  it("has 'role' column (required by admin plugin)", () => {
    expect(cols).toContain("role");
  });

  it("has 'banned' column (required by admin plugin)", () => {
    expect(cols).toContain("banned");
  });

  it("has 'banReason' column (required by admin plugin)", () => {
    expect(cols).toContain("banReason");
  });

  it("has 'banExpires' column (required by admin plugin)", () => {
    expect(cols).toContain("banExpires");
  });
});
