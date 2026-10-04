import { test, expect } from "@playwright/test";

test.describe("Monthly provisions (تهیه ماهانه)", () => {
  test("add → tick bought → defer to next month → both partners see", async ({ browser }) => {
    const ctxA = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    await pageA.goto("/login");
    await pageA.getByLabel("ایمیل").fill("test-owner@example.com");
    await pageA.getByLabel("رمز عبور").fill("Pass1234");
    await pageA.getByRole("button", { name: "ورود" }).click();
    await pageA.waitForURL("**/dashboard", { timeout: 30_000 });
    await pageA.goto("/shopping");
    await pageA.getByRole("tab", { name: "تهیه ماهانه" }).click();
    await expect(pageA.getByText(/مهر ۱۴۰۵/).first()).toBeVisible({ timeout: 15_000 });

    // add two staples
    const input = pageA.getByLabel("قلم ماهانه جدید");
    await input.fill("رب گوجه‌فرنگی تست");
    await pageA.getByRole("button", { name: "افزودن", exact: true }).click();
    await expect(pageA.getByText("رب گوجه‌فرنگی تست")).toBeVisible({ timeout: 15_000 });
    await input.fill("مایع ظرفشویی تست");
    await pageA.getByRole("button", { name: "افزودن", exact: true }).click();
    await expect(pageA.getByText("مایع ظرفشویی تست")).toBeVisible({ timeout: 15_000 });

    // tick "رب" specifically (row-scoped locator, not first())
    const robRow = pageA.locator("div.flex.items-center", { hasText: "رب گوجه‌فرنگی تست" }).first();
    await robRow.getByRole("button", { name: "خرید شد" }).click();
    await expect(pageA.getByText("خریداری‌شده").first()).toBeVisible({ timeout: 15_000 });

    // defer "مایع" (the other row) to next month
    const mayeRow = pageA.locator("div.flex.items-center", { hasText: "مایع ظرفشویی تست" }).first();
    await mayeRow.getByRole("button", { name: "میفته ماه بعد" }).click();
    await expect(pageA.getByText("به ماه بعد موکول شد")).toBeVisible({ timeout: 15_000 });

    // partner (fresh context) sees the bought item too — shared household
    const ctxB = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("ایمیل").fill("test-partner@example.com");
    await pageB.getByLabel("رمز عبور").fill("Pass1234");
    await pageB.getByRole("button", { name: "ورود" }).click();
    await pageB.waitForURL("**/dashboard", { timeout: 30_000 });
    await pageB.goto("/shopping");
    await pageB.getByRole("tab", { name: "تهیه ماهانه" }).click();
    await expect(pageB.getByText("رب گوجه‌فرنگی تست")).toBeVisible({ timeout: 15_000 });

    await ctxA.close();
    await ctxB.close();
  });
});
