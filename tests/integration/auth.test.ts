import { describe, it, expect, beforeAll } from "vitest";
import { call, registerUser, loginUser, uniqueSuffix } from "./helpers";

describe("AUTH integration", () => {
  it("health endpoint responds", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects invalid login with Persian message", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      json: { email: "test-owner@example.com", password: "wrong-password" },
    });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.message).toContain("اشتباه");
  });

  it("rejects malformed email", async () => {
    const res = await call("/api/auth/login", { method: "POST", json: { email: "not-an-email", password: "x" } });
    expect(res.status).toBe(400);
  });

  it("registers a fresh user and sets session cookie", async () => {
    const { cookie } = await registerUser("کاربر تست", `auth-${uniqueSuffix()}@example.com`);
    expect(cookie).toMatch(/^lh_session=/);
  });

  it("rejects duplicate email registration", async () => {
    const email = `dup-${uniqueSuffix()}@example.com`;
    await registerUser("یک", email);
    const res = await call("/api/auth/register", { method: "POST", json: { fullName: "دو", email, password: "Pass1234" } });
    expect(res.status).toBe(409);
  });

  it("password shorter than 8 rejected", async () => {
    const res = await call("/api/auth/register", {
      method: "POST",
      json: { fullName: "کوتاه", email: `short-${uniqueSuffix()}@example.com`, password: "123" },
    });
    expect(res.status).toBe(400);
  });

  it("me returns session user with household", async () => {
    const cookie = await loginUser("test-owner@example.com");
    const res = await call<{ email: string; household: { name: string; partner: { fullName: string } | null } }>(
      "/api/auth/me", {}, cookie,
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.email).toBe("test-owner@example.com");
    expect(res.body.data!.household?.partner?.fullName).toBe("سارا تست");
  });

  it("me without cookie → 401", async () => {
    const res = await call("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("protected route without cookie → 401", async () => {
    const res = await call("/api/expenses");
    expect(res.status).toBe(401);
  });

  it("logout kills the session", async () => {
    const cookie = await loginUser("test-owner@example.com");
    const out = await call("/api/auth/logout", { method: "POST" }, cookie);
    expect(out.status).toBe(200);
    const after = await call("/api/auth/me", {}, cookie);
    expect(after.status).toBe(401);
  });
});

describe("forgot/reset password integration", () => {
  it("forgot-password returns reset path for existing user", async () => {
    const res = await call<{ sent: boolean; resetPath?: string }>("/api/auth/forgot-password", {
      method: "POST",
      json: { email: "test-owner@example.com" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data!.sent).toBe(true);
    expect(res.body.data!.resetPath).toMatch(/^\/reset-password\?token=/);
  });

  it("forgot-password does not leak account existence (same shape)", async () => {
    const res = await call<{ sent: boolean; resetPath?: string }>("/api/auth/forgot-password", {
      method: "POST",
      json: { email: `nobody-${uniqueSuffix()}@example.com` },
    });
    expect(res.status).toBe(200);
    expect(res.body.data!.sent).toBe(true);
    expect(res.body.data!.resetPath).toBeUndefined();
  });

  it("reset with garbage token rejected", async () => {
    const res = await call("/api/auth/reset-password", {
      method: "POST",
      json: { token: "x".repeat(40), newPassword: "NewPass1234" },
    });
    expect(res.status).toBe(400);
  });

  it("full reset cycle: forgot → reset → login with new password", async () => {
    const email = `reset-${uniqueSuffix()}@example.com`;
    await registerUser("بازیابی", email, "OldPass1234");

    const forgot = await call<{ resetPath?: string }>("/api/auth/forgot-password", {
      method: "POST", json: { email },
    });
    const token = forgot.body.data!.resetPath!.split("token=")[1];

    const reset = await call("/api/auth/reset-password", {
      method: "POST", json: { token, newPassword: "NewPass1234" },
    });
    expect(reset.status).toBe(200);

    // old password no longer works
    const oldLogin = await call("/api/auth/login", { method: "POST", json: { email, password: "OldPass1234" } });
    expect(oldLogin.status).toBe(401);

    // new one does
    const newLogin = await call("/api/auth/login", { method: "POST", json: { email, password: "NewPass1234" } });
    expect(newLogin.status).toBe(200);

    // token is single-use
    const reuse = await call("/api/auth/reset-password", {
      method: "POST", json: { token, newPassword: "AnotherPass1234" },
    });
    expect(reuse.status).toBe(400);
  });
});
