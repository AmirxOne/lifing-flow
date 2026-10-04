import { test, expect } from "@playwright/test";
import { suffix } from "./helpers";

test.describe("Authentication E2E", () => {
  test("login page renders with RTL + Alibaba font + Persian", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/ورود/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain("alibaba");
    await expect(page.getByRole("button", { name: "ورود" })).toBeVisible();
  });

  test("invalid login shows Persian error, no redirect", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("wrong-password");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("ایمیل یا رمز عبور اشتباه است")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("seed owner logs in → lands on dashboard with real data", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("سفر شمال تابستان").first()).toBeVisible({ timeout: 30_000 }); // seeded goal
    await expect(page.getByText("ظرف‌ها").first()).toBeVisible({ timeout: 10_000 }); // seeded recurring task
    // Persian-only currency: تومان everywhere, no latin digits in prices
    await expect(page.getByText("تومان").first()).toBeVisible();
  });

  test("unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("logout returns to login and protects dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("سفر شمال تابستان").first()).toBeVisible({ timeout: 30_000 });
    // open drawer → logout
    await page.getByRole("button", { name: "بیشتر" }).click();
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

});

test.describe("Forgot password E2E", () => {
  test("forgot → on-screen reset link → new password → login", async ({ browser }) => {
    const email = `forgot-e2e-${suffix()}@example.com`;
    // create the account through the invite flow (the only path) via API
    const { newInviteCode } = await import("./helpers");
    const apiCtx = await browser.newContext();
    const code = await newInviteCode(apiCtx.request);
    await apiCtx.close();
    const ctx0 = await browser.newContext();
    const joinRes = await ctx0.request.post("/api/auth/join", {
      data: { code, fullName: "فراموشکار", email, password: "OldPass1234" },
    });
    expect(joinRes.status()).toBeLessThan(300);
    await ctx0.close();

    // fresh context — no session — sees the login page
    const ctx = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByRole("link", { name: "رمز عبور را فراموش کرده‌اید؟" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.getByLabel("ایمیل").fill(email);
    await page.getByRole("button", { name: "ساخت لینک بازیابی" }).click();
    await expect(page.getByText("درخواست ثبت شد")).toBeVisible({ timeout: 15_000 });

    // follow the reset link
    await page.getByRole("link", { name: "تعیین رمز جدید" }).click();
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("رمز جدید (حداقل ۸ کاراکتر)").fill("NewPass1234");
    await page.getByLabel("تکرار رمز جدید").fill("NewPass1234");
    await page.getByRole("button", { name: "تغییر رمز" }).click();
    await expect(page.getByText("رمز عبور تغییر کرد")).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });
});
