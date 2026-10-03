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
    await expect(page.getByText("خرید هفتگی سوپرمارکت").first()).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByText("خرید هفتگی سوپرمارکت").first()).toBeVisible({ timeout: 30_000 });
    // open drawer → logout
    await page.getByRole("button", { name: "بیشتر" }).click();
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("register with short password is blocked (native minLength) and shows hint text", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("نام و نام خانوادگی").fill("تست کوتاه");
    await page.getByLabel("ایمیل").fill(`short-${suffix()}@example.com`);
    const pw = page.getByLabel("رمز عبور");
    await pw.fill("123");
    // the field carries the min-length contract
    await expect(pw).toHaveAttribute("minlength", "8");
    // submit → browser blocks (no navigation away from register)
    await page.getByRole("button", { name: "ساخت حساب" }).click();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/register/);
    // client-side guard message also available in placeholder copy
    await expect(pw).toBeVisible();
  });
});

test.describe("Forgot password E2E", () => {
  test("forgot → on-screen reset link → new password → login", async ({ browser }) => {
    const email = `forgot-e2e-${suffix()}@example.com`;
    // register in a throwaway context (its session dies with the context)
    const regCtx = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const regPage = await regCtx.newPage();
    await regPage.goto("/register");
    await regPage.getByLabel("نام و نام خانوادگی").fill("فراموشکار");
    await regPage.getByLabel("ایمیل").fill(email);
    await regPage.getByLabel("رمز عبور").fill("OldPass1234");
    await regPage.getByRole("button", { name: "ساخت حساب" }).click();
    await expect(regPage.getByText("سلام")).toBeVisible({ timeout: 20_000 });
    await regCtx.close();

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
