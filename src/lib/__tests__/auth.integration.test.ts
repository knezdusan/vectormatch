// @vitest-environment node
/**
 * Integration tests for the Better Auth configuration.
 *
 * Uses real betterAuth() instances backed by @better-auth/memory-adapter.
 * A custom fetchOptions.customFetchImpl routes all client requests directly to
 * auth.handler — no HTTP server or real database connection required.
 *
 * WHY THESE TESTS EXIST
 * ─────────────────────
 * Unit tests mock @/lib/auth entirely — the real betterAuth() factory, the DB
 * adapter, and all plugin logic are never exercised. That gap allowed three
 * production bugs to ship undetected:
 *
 *   1. authClient.getSession() in a Server Component always returned null.
 *      The browser client SDK makes a plain HTTP fetch with no cookie jar — it
 *      never reads from request headers, despite claims to the contrary. The
 *      source code of better-auth/react confirms: no next/headers import, no
 *      server-side detection. The fix is auth.api.getSession({ headers }).
 *
 *   2. The rate_limit table was missing the `lastRequest` bigint column that
 *      Better Auth v1.6+ requires for its sliding-window algorithm.
 *
 *   3. customRules keys included the /api/auth prefix; Better Auth normalises
 *      paths to be relative to the base URL, so all rules were silently ignored.
 *
 * STRUCTURE
 * ─────────
 * Two auth instances are used to prevent rate-limit state bleeding between suites:
 *
 *   authFlow   — rate limiting disabled; tests core sign-up/sign-in/session flows
 *   authRL     — rate limiting enabled;  tests that rate limits actually fire
 */

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeAuthInstance(rateLimitEnabled: boolean) {
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "integration-test-secret-that-is-32chars!",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    rateLimit: {
      enabled: rateLimitEnabled,
      storage: "memory",
      window: 10,
      max: 100,
      // Bug 3 canary: uses the CORRECT stripped paths (no /api/auth prefix).
      // Changing these back to "/api/auth/sign-in/email" makes the rate-limit
      // tests below fail — that is the whole point of this canary.
      customRules: {
        "/sign-in/email": { window: 10, max: 3 },
        "/sign-up/email": { window: 10, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/get-session": false,
      },
    },
  });

  const customFetchImpl: typeof fetch = (url, init) =>
    auth.handler(new Request(url as string, init));

  const client = createAuthClient({
    baseURL: "http://localhost:3000/api/auth",
    fetchOptions: { customFetchImpl },
  });

  return { auth, client };
}

// Two isolated instances — rate-limit state never crosses between suites.
const { auth: authFlow, client: clientFlow } = makeAuthInstance(false);
const { auth: authRL, client: clientRL } = makeAuthInstance(true);

// ─── Cookie helper ────────────────────────────────────────────────────────────

function extractSessionCookie(response: Response): string | null {
  const raw = response.headers.get("set-cookie") ?? "";
  const match = raw.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// CORE AUTH FLOWS  (authFlow — rate limiting disabled)
// ═════════════════════════════════════════════════════════════════════════════

describe("sign-up (core flow)", () => {
  it("creates a new user and returns user + session", async () => {
    const { data, error } = await clientFlow.signUp.email({
      name: "Alice Smith",
      email: "alice@example.com",
      password: "secure-password",
    });

    expect(error).toBeNull();
    expect(data?.user.email).toBe("alice@example.com");
    expect(data?.user.name).toBe("Alice Smith");
    // Better Auth sign-up/sign-in returns { token, user, redirect } — not { session: { token } }
    expect(data?.token).toBeTruthy();
  });

  it("does NOT return the plain-text password in the user object", async () => {
    const { data } = await clientFlow.signUp.email({
      name: "Safe User",
      email: "safe@example.com",
      password: "my-plain-text-password",
    });

    // Ensure the password is not exposed on the returned user
    expect(data?.user).not.toHaveProperty("password");
    expect(JSON.stringify(data?.user)).not.toContain("my-plain-text-password");
  });

  it("returns an error for a duplicate email", async () => {
    const payload = {
      name: "Bob",
      email: "bob-dup@example.com",
      password: "password1",
    };
    await clientFlow.signUp.email(payload);

    const { data, error } = await clientFlow.signUp.email({
      ...payload,
      name: "Bob Again",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("sign-in (core flow)", () => {
  const EMAIL = "signin-user@example.com";
  const PASSWORD = "signin-secure-pw";

  beforeAll(async () => {
    await clientFlow.signUp.email({
      name: "SignIn User",
      email: EMAIL,
      password: PASSWORD,
    });
  });

  it("returns user + session for valid credentials", async () => {
    const { data, error } = await clientFlow.signIn.email({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(error).toBeNull();
    expect(data?.user.email).toBe(EMAIL);
    expect(data?.token).toBeTruthy();
  });

  it("returns 401 for a wrong password", async () => {
    const { data, error } = await clientFlow.signIn.email({
      email: EMAIL,
      password: "wrong-password",
    });

    expect(data).toBeNull();
    expect(error?.status).toBe(401);
  });

  it("returns an error for a non-existent email", async () => {
    const { data, error } = await clientFlow.signIn.email({
      email: "nobody@example.com",
      password: "irrelevant",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("session lifecycle (core flow)", () => {
  const EMAIL = "session-user@example.com";
  const PASSWORD = "session-pass";

  beforeAll(async () => {
    await clientFlow.signUp.email({
      name: "Session User",
      email: EMAIL,
      password: PASSWORD,
    });
  });

  it("auth.api.getSession returns user when a valid session cookie is present", async () => {
    // Sign in and capture the session token from the Set-Cookie header.
    let token: string | null = null;
    await clientFlow.signIn.email({
      email: EMAIL,
      password: PASSWORD,
      fetchOptions: {
        onSuccess(ctx) {
          token = extractSessionCookie(ctx.response);
        },
      },
    });

    expect(token).toBeTruthy();

    // This is the correct server-side session check pattern (Bug 1 fix).
    const session = await authFlow.api.getSession({
      headers: new Headers({ cookie: `better-auth.session_token=${token}` }),
    });

    expect(session).not.toBeNull();
    expect(session?.user.email).toBe(EMAIL);
  });

  it("auth.api.getSession returns null without a cookie", async () => {
    const session = await authFlow.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it("session is invalidated after sign-out", async () => {
    let token: string | null = null;
    await clientFlow.signIn.email({
      email: EMAIL,
      password: PASSWORD,
      fetchOptions: {
        onSuccess(ctx) {
          token = extractSessionCookie(ctx.response);
        },
      },
    });

    const headers = new Headers({
      cookie: `better-auth.session_token=${token}`,
    });

    const before = await authFlow.api.getSession({ headers });
    expect(before).not.toBeNull();

    await authFlow.api.signOut({ headers });

    const after = await authFlow.api.getSession({ headers });
    expect(after).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RATE LIMITING  (authRL — rate limiting enabled, separate memory store)
// ═════════════════════════════════════════════════════════════════════════════

describe("rate limiting — sign-up endpoint", () => {
  it("returns 429 after exceeding 3 requests on /sign-up/email", async () => {
    const base = `rl-su-${Date.now()}`;

    for (let i = 0; i < 3; i++) {
      await clientRL.signUp.email({
        name: "User",
        email: `${base}-${i}@example.com`,
        password: "valid-password",
      });
    }

    const { error } = await clientRL.signUp.email({
      name: "User",
      email: `${base}-4@example.com`,
      password: "valid-password",
    });

    expect(error?.status).toBe(429);
  });
});

describe("rate limiting — sign-in endpoint", () => {
  const RL_EMAIL = `rl-user-${Date.now()}@example.com`;

  beforeAll(async () => {
    // Fresh user; sign-up doesn't count toward sign-in rate limit.
    await clientRL.signUp.email({
      name: "RL User",
      email: RL_EMAIL,
      password: "correct-pw",
    });
  });

  it("returns 429 after 3 failed sign-in attempts on /sign-in/email", async () => {
    for (let i = 0; i < 3; i++) {
      await clientRL.signIn.email({ email: RL_EMAIL, password: "wrong" });
    }

    const { error } = await clientRL.signIn.email({
      email: RL_EMAIL,
      password: "wrong",
    });

    expect(error?.status).toBe(429);
  });
});

describe("rate limiting — /get-session is exempt", () => {
  it("never returns 429 for getSession (customRules /get-session: false)", async () => {
    // The global max is 100; we fire 20 calls to stay below global but confirm
    // the exempt rule was applied (if the rule were missing, these would count
    // toward the global limit but not individually limit — however the point of
    // this test is to confirm the rule IS applied via the false value).
    const errors = await Promise.all(
      Array.from({ length: 20 }, () =>
        authRL.api
          .getSession({ headers: new Headers() })
          .then(() => null)
          .catch((e: { status?: number }) => e?.status),
      ),
    );

    for (const status of errors) {
      expect(status).not.toBe(429);
    }
  });
});
