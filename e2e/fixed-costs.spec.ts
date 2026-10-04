import { test, expect } from "@playwright/test";
import { loginViaUi as login } from "./helpers";

async function prepare(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
  });
}

test.describe("Fixed monthly costs", () => {
  test("add via UI → tick pay → auto-logged in expenses → partner sees paid", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, "test-owner@example.com");
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    await prepare(page);

    // clean residue
    await page.request.post("/api/auth/login", { data: { email: "test-owner@example.com", password: "Pass1234" } }).catch(() => {});
    const existing = await (await page.request.get("/api/fixed-costs")).json();
    for (const item of existing.data?.items ?? []) {
      if (item.title.includes("تست")) await page.request.delete(`/api/fixed-costs?id=${item.id}`);
    }

    await page.goto("/finance");
    await page.getByRole("tab", { name: "هزینه‌های ثابت" }).click();
    await page.waitForTimeout(1500);

    // add via modal
    await page.getByRole("button", { name: "+ افزودن" }).first().click();
    await page.waitForTimeout(600);
    await page.locator("#fixed-title").fill("قسط ماشین تست");
    // type Persian digits char by char so FaInput onChange fires per keystroke
    for (const ch of "3000000") {
      await page.locator("#fixed-amount").pressSequentially(ch, { delay: 30 }).catch(() => page.locator("#fixed-amount").type(ch));
    }
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "ذخیره");
      btns[btns.length - 1].click();
    });
    await expect(page.getByText("قسط ماشین تست").first()).toBeVisible({ timeout: 10000 });

    // tick pay
    await page.getByRole("button", { name: /^پرداخت قسط ماشین تست$/ }).click({ force: true });
    await expect(page.getByText(/پرداخت شد/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=قسط ماشین تست").first()).toHaveClass(/line-through/);

    // expenses tab shows the auto-logged entry
    await page.getByRole("tab", { name: "هزینه‌ها", exact: true }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText(/قسط ماشین تست \(1405/).first()).toBeVisible({ timeout: 10000 });

    // partner sees it paid
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();
    await login(page2, "test-partner@example.com");
    await page2.waitForURL("**/dashboard", { timeout: 30000 });
    await page2.goto("/finance");
    await page2.getByRole("tab", { name: "هزینه‌های ثابت" }).click();
    await page2.waitForTimeout(1500);
    await expect(page2.getByText("قسط ماشین تست").first()).toBeVisible({ timeout: 10000 });
    await expect(page2.locator(".line-through", { hasText: "قسط ماشین تست" }).first()).toBeVisible({ timeout: 10000 });

    // cleanup
    const mine = await (await page.request.get("/api/fixed-costs")).json();
    for (const item of mine.data?.items ?? []) {
      if (item.title.includes("تست")) await page.request.delete(`/api/fixed-costs?id=${item.id}`);
    }
    await ctx.close();
    await ctx2.close();
  });
});
