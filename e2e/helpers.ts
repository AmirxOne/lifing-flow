import { test, expect, type Page } from "@playwright/test";

/**
 * E2E helpers — real browser against the running dev server.
 * Uses unique suffixes so reruns never collide with leftover data.
 */

export function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function registerViaUi(page: Page, fullName: string, email: string, password = "Pass1234"): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("نام و نام خانوادگی").fill(fullName);
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ساخت حساب" }).click();
  await expect(page.getByText("سلام")).toBeVisible({ timeout: 20_000 });
}

export async function loginViaUi(page: Page, email: string, password = "Pass1234"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

export async function createHouseholdViaUi(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "🏡 خانواده جدید بسازم" }).click();
  await page.getByLabel("نام خانواده").fill(name);
  await page.getByRole("button", { name: "ساخت خانواده" }).click();
  await expect(page.getByText("دعوت همسرتان")).toBeVisible({ timeout: 20_000 });
}
