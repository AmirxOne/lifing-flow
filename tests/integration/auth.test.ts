import { describe, it, expect } from "vitest";
import { call, loginUser, joinViaInvite, uniqueSuffix } from "./helpers";
import { fixtureSoloHousehold } from "./db-fixtures";

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

  it("public registration is CLOSED (private app law)", async () => {
    const res = await call("/api/auth/register", {
      method: "POST",
      json: {
        fullName: "مهاجم", email: `intruder-${uniqueSuffix()}@example.com`, password: "Pass1234",
        householdName: "خانواده مهاجم",
      },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("REGISTRATION_CLOSED");
  });

  it("partner joins via invite code — the only account-creation path", async () => {
    const solo = await fixtureSoloHousehold(uniqueSuffix());
    const owner = await loginUser(solo.owner.email);
    const invite = await call<{ code: string }>("/api/household/invite", { method: "POST", json: {} }, owner);
    expect([200, 201]).toContain(invite.status);
    const code = invite.body.data!.code;

    const email = `join-it-${uniqueSuffix()}@example.com`;
    const joined = await joinViaInvite(code, "همسر تست", email);
    expect(joined.cookie).toMatch(/^lh_session=/);

    // same email cannot join again — valid code from a different solo household
    const solo2 = await fixtureSoloHousehold(uniqueSuffix());
    const owner2 = await loginUser(solo2.owner.email);
    const invite2 = await call<{ code: string }>("/api/household/invite", { method: "POST", json: {} }, owner2);
    const dup = await call("/api/auth/join", {
      method: "POST",
      json: { code: invite2.body.data!.code, fullName: "دو", email, password: "Pass1234" },
    });
    expect(dup.status).toBe(409);
  });

  it("join with garbage invite code → 404", async () => {
    const res = await call("/api/auth/join", {
      method: "POST",
      json: { code: "ZZZZ9999", fullName: "بی‌کد", email: `nocode-${uniqueSuffix()}@example.com`, password: "Pass1234" },
    });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("INVALID_INVITE");
  });

  it("join with short password → 400 (schema validated before code)", async () => {
    const res = await call("/api/auth/join", {
      method: "POST",
      json: { code: "AAAA1111", fullName: "کوتاه", email: `shortj-${uniqueSuffix()}@example.com`, password: "123" },
    });
    // zod validates the body BEFORE the invite code is checked → always 400
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
    // create a throwaway partner via invite, then reset their password
    const solo = await fixtureSoloHousehold(uniqueSuffix());
    const owner = await loginUser(solo.owner.email);
    const invite = await call<{ code: string }>("/api/household/invite", { method: "POST", json: {} }, owner);
    const email = `reset-${uniqueSuffix()}@example.com`;
    await joinViaInvite(invite.body.data!.code, "بازیابی", email, "OldPass1234");

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
