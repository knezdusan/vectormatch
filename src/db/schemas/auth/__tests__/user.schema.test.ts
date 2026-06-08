/**
 * Unit tests for Better Auth Zod schemas defined in user.ts.
 * Pure logic — no mocks, no I/O.
 *
 * Coverage philosophy: keep tests that catch non-obvious regressions
 * (boundary values, exact error copy, deliberate design decisions) and
 * remove tests that verify behavior so basic a single form submission would
 * surface it (missing required fields, standard Zod rejection).
 */

import { signInSchema, signUpSchema, userSchema } from "@/db/schemas/auth/user";

// ─── signUpSchema ──────────────────────────────────────────────────────────────

describe("signUpSchema", () => {
  const VALID = {
    name: "Alice Smith",
    email: "alice@example.com",
    password: "secure123",
  };

  it("accepts a fully valid payload and returns only expected keys", () => {
    const result = signUpSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(VALID);
  });

  it("strips unexpected extra fields (injection guard)", () => {
    const result = signUpSchema.safeParse({ ...VALID, role: "admin" });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).not.toContain("role");
  });

  // --- name boundary values and exact error copy ---

  it("rejects name shorter than 2 characters with correct error", () => {
    const result = signUpSchema.safeParse({ ...VALID, name: "A" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe(
        "Name must be at least 2 characters",
      );
  });

  it("accepts name at exact minimum boundary (2 chars)", () => {
    expect(signUpSchema.safeParse({ ...VALID, name: "Jo" }).success).toBe(true);
  });

  it("rejects name longer than 50 characters with correct error", () => {
    const result = signUpSchema.safeParse({ ...VALID, name: "A".repeat(51) });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Name too long");
  });

  it("accepts name at exact maximum boundary (50 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, name: "A".repeat(50) }).success,
    ).toBe(true);
  });

  // --- email ---

  it("rejects an invalid email with correct error copy", () => {
    const result = signUpSchema.safeParse({ ...VALID, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Invalid email address");
  });

  it("rejects email longer than 255 characters", () => {
    const longEmail = `${"a".repeat(250)}@b.com`;
    expect(signUpSchema.safeParse({ ...VALID, email: longEmail }).success).toBe(
      false,
    );
  });

  // --- password boundary values and exact error copy ---

  it("rejects password shorter than 8 characters with correct error", () => {
    const result = signUpSchema.safeParse({ ...VALID, password: "short1" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
  });

  it("accepts password at exact minimum boundary (8 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, password: "exactly8" }).success,
    ).toBe(true);
  });

  it("rejects password longer than 128 characters with correct error", () => {
    const result = signUpSchema.safeParse({
      ...VALID,
      password: "A".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Password too long");
  });

  it("accepts password at exact maximum boundary (128 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, password: "A".repeat(128) }).success,
    ).toBe(true);
  });
});

// ─── signInSchema ──────────────────────────────────────────────────────────────

describe("signInSchema", () => {
  const VALID = { email: "alice@example.com", password: "anypassword" };

  it("rejects invalid email format with correct error copy", () => {
    const result = signInSchema.safeParse({ ...VALID, email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Invalid email address");
  });

  it("rejects empty password with correct error copy", () => {
    const result = signInSchema.safeParse({ ...VALID, password: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Password is required");
  });

  // Deliberate design decision: sign-in accepts any non-empty password
  // (no min-length) so returning users with short legacy passwords can still sign in.
  it("accepts a 1-character password (no min-length on sign-in)", () => {
    expect(signInSchema.safeParse({ ...VALID, password: "x" }).success).toBe(
      true,
    );
  });

  it("strips unexpected extra fields (injection guard)", () => {
    const result = signInSchema.safeParse({ ...VALID, remember: true });
    expect(result.success).toBe(true);
    if (result.success)
      expect(Object.keys(result.data)).not.toContain("remember");
  });
});

// ─── userSchema ───────────────────────────────────────────────────────────────

describe("userSchema", () => {
  const VALID = { name: "Bob", email: "bob@example.com" };

  it("rejects a non-URL image string with correct error copy", () => {
    const result = userSchema.safeParse({ ...VALID, image: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("Invalid image URL");
  });

  it("accepts null image (optional field can be explicitly nulled)", () => {
    expect(userSchema.safeParse({ ...VALID, image: null }).success).toBe(true);
  });

  it("accepts a valid https image URL", () => {
    expect(
      userSchema.safeParse({
        ...VALID,
        image: "https://example.com/avatar.png",
      }).success,
    ).toBe(true);
  });
});
