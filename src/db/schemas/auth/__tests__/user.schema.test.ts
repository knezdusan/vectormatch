/**
 * Unit tests for Better Auth Zod schemas defined in user.ts.
 * Pure logic — no mocks, no I/O.
 */

import { signInSchema, signUpSchema, userSchema } from "@/db/schemas/auth/user";

// ─── signUpSchema ──────────────────────────────────────────────────────────────

describe("signUpSchema", () => {
  const VALID = {
    name: "Alice Smith",
    email: "alice@example.com",
    password: "secure123",
  };

  it("accepts a fully valid payload", () => {
    const result = signUpSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID);
    }
  });

  it("strips unexpected extra fields", () => {
    const result = signUpSchema.safeParse({ ...VALID, role: "admin" });
    expect(result.success).toBe(true);
    if (result.success) {
      // 'role' must not appear in output
      expect(Object.keys(result.data)).not.toContain("role");
    }
  });

  // --- name ---

  it("rejects name shorter than 2 characters", () => {
    const result = signUpSchema.safeParse({ ...VALID, name: "A" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Name must be at least 2 characters",
      );
    }
  });

  it("rejects empty name", () => {
    const result = signUpSchema.safeParse({ ...VALID, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 50 characters", () => {
    const result = signUpSchema.safeParse({ ...VALID, name: "A".repeat(51) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Name too long");
    }
  });

  it("accepts name at exact minimum boundary (2 chars)", () => {
    expect(signUpSchema.safeParse({ ...VALID, name: "Jo" }).success).toBe(true);
  });

  it("accepts name at exact maximum boundary (50 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, name: "A".repeat(50) }).success,
    ).toBe(true);
  });

  it("rejects missing name field", () => {
    const { name: _n, ...rest } = VALID;
    expect(signUpSchema.safeParse(rest).success).toBe(false);
  });

  // --- email ---

  it("rejects an invalid email format", () => {
    const result = signUpSchema.safeParse({ ...VALID, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email address");
    }
  });

  it("rejects email without domain", () => {
    expect(signUpSchema.safeParse({ ...VALID, email: "alice@" }).success).toBe(
      false,
    );
  });

  it("rejects email longer than 255 characters", () => {
    const longEmail = `${"a".repeat(250)}@b.com`;
    expect(signUpSchema.safeParse({ ...VALID, email: longEmail }).success).toBe(
      false,
    );
  });

  it("rejects missing email field", () => {
    const { email: _e, ...rest } = VALID;
    expect(signUpSchema.safeParse(rest).success).toBe(false);
  });

  // --- password ---

  it("rejects password shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({ ...VALID, password: "short1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
    }
  });

  it("accepts password at exact minimum boundary (8 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, password: "exactly8" }).success,
    ).toBe(true);
  });

  it("rejects password longer than 128 characters", () => {
    const result = signUpSchema.safeParse({
      ...VALID,
      password: "A".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password too long");
    }
  });

  it("accepts password at exact maximum boundary (128 chars)", () => {
    expect(
      signUpSchema.safeParse({ ...VALID, password: "A".repeat(128) }).success,
    ).toBe(true);
  });

  it("rejects missing password field", () => {
    const { password: _p, ...rest } = VALID;
    expect(signUpSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(signUpSchema.safeParse({ ...VALID, password: "" }).success).toBe(
      false,
    );
  });
});

// ─── signInSchema ──────────────────────────────────────────────────────────────

describe("signInSchema", () => {
  const VALID = { email: "alice@example.com", password: "anypassword" };

  it("accepts valid email and password", () => {
    expect(signInSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signInSchema.safeParse({ ...VALID, email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email address");
    }
  });

  it("rejects empty password", () => {
    const result = signInSchema.safeParse({ ...VALID, password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });

  it("accepts a 1-character password (sign-in has no min-length requirement)", () => {
    expect(signInSchema.safeParse({ ...VALID, password: "x" }).success).toBe(
      true,
    );
  });

  it("rejects missing email", () => {
    const { email: _e, ...rest } = VALID;
    expect(signInSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing password", () => {
    const { password: _p, ...rest } = VALID;
    expect(signInSchema.safeParse(rest).success).toBe(false);
  });

  it("strips unexpected extra fields", () => {
    const result = signInSchema.safeParse({ ...VALID, remember: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain("remember");
    }
  });
});

// ─── userSchema ───────────────────────────────────────────────────────────────

describe("userSchema", () => {
  const VALID = { name: "Bob", email: "bob@example.com" };

  it("accepts name + email without image", () => {
    expect(userSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a valid image URL", () => {
    expect(
      userSchema.safeParse({
        ...VALID,
        image: "https://example.com/avatar.png",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-URL image string", () => {
    const result = userSchema.safeParse({ ...VALID, image: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid image URL");
    }
  });

  it("accepts null image (optional field)", () => {
    expect(userSchema.safeParse({ ...VALID, image: null }).success).toBe(true);
  });
});
