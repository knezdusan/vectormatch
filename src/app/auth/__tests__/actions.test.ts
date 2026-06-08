/**
 * Unit tests for Better Auth server actions (signUpAction / signInAction).
 *
 * Strategy:
 *  - Use vi.hoisted() so mock fn refs exist when vi.mock factory runs (required
 *    because vi.mock is hoisted to the top of the file at compile time but
 *    const declarations are not).
 *  - Mock @/lib/auth entirely so the real betterAuth() (and DATABASE_URL) is
 *    never touched.
 *  - next/navigation redirect and next/headers are already mocked in
 *    vitest.setup.ts; we just import redirect for assertions.
 */

import { redirect } from "next/navigation";
import { signInAction, signUpAction } from "@/app/auth/actions";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────
// vi.hoisted runs before module imports so these refs are available when
// vi.mock factory closes over them.

const { mockSignUpEmail, mockSignInEmail } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn(),
  mockSignInEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signUpEmail: mockSignUpEmail,
      signInEmail: mockSignInEmail,
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const VALID_SIGNUP = {
  name: "Alice Smith",
  email: "alice@example.com",
  password: "secure123",
};

const VALID_SIGNIN = {
  email: "alice@example.com",
  password: "secure123",
};

// ─── signUpAction ──────────────────────────────────────────────────────────────

describe("signUpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUpEmail.mockResolvedValue({ token: "tok", user: {} });
  });

  // --- Validation failures (auth should never be called) ---

  it("returns error when name is missing", async () => {
    const fd = makeFormData({
      email: VALID_SIGNUP.email,
      password: VALID_SIGNUP.password,
    });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("returns error when name is too short (< 2 chars)", async () => {
    const fd = makeFormData({ ...VALID_SIGNUP, name: "A" });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Name must be at least 2 characters",
    });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("returns error when name is too long (> 50 chars)", async () => {
    const fd = makeFormData({ ...VALID_SIGNUP, name: "A".repeat(51) });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({ success: false, error: "Name too long" });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("returns error for invalid email", async () => {
    const fd = makeFormData({ ...VALID_SIGNUP, email: "not-an-email" });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Invalid email address",
    });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("returns error when password is too short (< 8 chars)", async () => {
    const fd = makeFormData({ ...VALID_SIGNUP, password: "short" });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Password must be at least 8 characters",
    });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("returns error when password is too long (> 128 chars)", async () => {
    const fd = makeFormData({ ...VALID_SIGNUP, password: "A".repeat(129) });
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Password too long",
    });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  // --- Happy path ---

  it("calls auth.api.signUpEmail with validated body on success", async () => {
    const fd = makeFormData(VALID_SIGNUP);
    await signUpAction(null, fd);
    expect(mockSignUpEmail).toHaveBeenCalledOnce();
    const call = mockSignUpEmail.mock.calls[0][0];
    expect(call.body).toMatchObject({
      name: VALID_SIGNUP.name,
      email: VALID_SIGNUP.email,
      password: VALID_SIGNUP.password,
    });
  });

  it("calls redirect('/dashboard') after successful signup", async () => {
    const fd = makeFormData(VALID_SIGNUP);
    await signUpAction(null, fd);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("passes awaited request headers to auth.api.signUpEmail", async () => {
    const fd = makeFormData(VALID_SIGNUP);
    await signUpAction(null, fd);
    const call = mockSignUpEmail.mock.calls[0][0];
    expect(call.headers).toBeDefined();
  });

  // --- Error handling ---

  it("returns APIError message when auth.api.signUpEmail throws APIError", async () => {
    const { APIError } = await import("better-auth");
    // First arg is an HTTP status name; custom code goes in body.code
    mockSignUpEmail.mockRejectedValueOnce(
      new APIError("CONFLICT", {
        message: "Email already in use",
        code: "EMAIL_ALREADY_EXISTS",
      }),
    );
    const fd = makeFormData(VALID_SIGNUP);
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({ success: false });
    expect(result?.error).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns generic message for unexpected throws", async () => {
    mockSignUpEmail.mockRejectedValueOnce(new Error("DB connection lost"));
    const fd = makeFormData(VALID_SIGNUP);
    const result = await signUpAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "An unexpected error occurred",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ─── signInAction ──────────────────────────────────────────────────────────────

describe("signInAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInEmail.mockResolvedValue({ token: "tok", user: {} });
  });

  // --- Validation failures ---

  it("returns error when email is missing", async () => {
    const fd = makeFormData({ password: VALID_SIGNIN.password });
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it("returns error for invalid email", async () => {
    const fd = makeFormData({ ...VALID_SIGNIN, email: "bad" });
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Invalid email address",
    });
  });

  it("returns error when password is empty", async () => {
    const fd = makeFormData({ ...VALID_SIGNIN, password: "" });
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "Password is required",
    });
  });

  it("returns error when password is missing", async () => {
    const fd = makeFormData({ email: VALID_SIGNIN.email });
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({ success: false, error: expect.any(String) });
  });

  // --- Happy path ---

  it("calls auth.api.signInEmail with validated body", async () => {
    const fd = makeFormData(VALID_SIGNIN);
    await signInAction(null, fd);
    expect(mockSignInEmail).toHaveBeenCalledOnce();
    const call = mockSignInEmail.mock.calls[0][0];
    expect(call.body).toMatchObject({
      email: VALID_SIGNIN.email,
      password: VALID_SIGNIN.password,
    });
  });

  it("calls redirect('/dashboard') on successful sign-in", async () => {
    const fd = makeFormData(VALID_SIGNIN);
    await signInAction(null, fd);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  // --- Error handling ---

  it("returns APIError message when auth.api.signInEmail throws APIError", async () => {
    const { APIError } = await import("better-auth");
    // First arg is an HTTP status name; custom code goes in body.code
    mockSignInEmail.mockRejectedValueOnce(
      new APIError("UNAUTHORIZED", {
        message: "Invalid email or password",
        code: "INVALID_PASSWORD",
      }),
    );
    const fd = makeFormData(VALID_SIGNIN);
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({ success: false });
    expect(result?.error).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns generic message for unexpected throws", async () => {
    mockSignInEmail.mockRejectedValueOnce(new TypeError("network error"));
    const fd = makeFormData(VALID_SIGNIN);
    const result = await signInAction(null, fd);
    expect(result).toMatchObject({
      success: false,
      error: "An unexpected error occurred",
    });
  });

  // --- Previous state ignored ---

  it("ignores prevState — always re-validates fresh form data", async () => {
    const prevError = { error: "old error", success: false };
    const fd = makeFormData(VALID_SIGNIN);
    await signInAction(prevError, fd);
    expect(mockSignInEmail).toHaveBeenCalledOnce();
  });
});
