import { test, expect } from "@playwright/test";
import { suffix, joinViaUi, provisionSoloHousehold } from "./helpers";

test.describe("Full couple workflow E2E (the golden path)", () => {
  test("A invites → B joins via /join → shared life", async ({ browser, request }) => {
    const s = suffix();

    // ── A: fresh solo household (DB-provisioned, like seed) ──
    const host = provisionSoloHousehold(s);
    const ctxA = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    await pageA.goto("/login");
    await pageA.getByLabel("ایمیل").fill(host.email);
    await pageA.getByLabel("رمز عبور").fill("Pass1234");
    await pageA.getByRole("button", { name: "ورود" }).click();
    await expect(pageA.getByText("در انتظار همسر…")).toBeVisible({ timeout: 20_000 });
    await pageA.goto("/settings");
    await pageA.getByRole("button", { name: "ساخت کد دعوت" }).click();
    const codeEl = pageA.locator("code[dir='ltr'], div[dir='ltr'].font-mono");
    await expect(codeEl.first()).toBeVisible({ timeout: 15_000 });
    const code = (await codeEl.first().textContent())!.trim();

    // ── B: brand-new account via /join ──
    const ctxB = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    await joinViaUi(pageB, code, "کاربر ب", `b-${s}@example.com`);
    await expect(pageB).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(pageB.getByText("خریدهای ضروری")).toBeVisible({ timeout: 20_000 });

    // ── A adds an expense ──
    await pageA.goto("/finance");
    await pageA.getByRole("button", { name: "+ هزینه جدید" }).click();
    await pageA.getByLabel("عنوان").fill("شام رستوران");
    await pageA.getByLabel("مبلغ (تومان)").fill("۵۰۰۰۰۰");
    await pageA.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(pageA.getByText("شام رستوران").first()).toBeVisible({ timeout: 20_000 });
    await expect(pageA.getByText("۵۰۰٬۰۰۰ تومان").first()).toBeVisible();

    // ── B sees A's expense (shared household) ──
    await pageB.goto("/finance");
    await expect(pageB.getByText("شام رستوران").first()).toBeVisible({ timeout: 20_000 });

    // ── B adds a shopping item ──
    await pageB.goto("/shopping");
    await pageB.getByRole("button", { name: "+ افزودن" }).click();
    await pageB.getByLabel("نام کالا").fill("پنیر");
    await pageB.getByRole("button", { name: "افزودن", exact: true }).click();
    await expect(pageB.getByText("پنیر").first()).toBeVisible({ timeout: 20_000 });

    // ── A sees B's shopping item ──
    await pageA.goto("/shopping");
    await expect(pageA.getByText("پنیر").first()).toBeVisible({ timeout: 20_000 });

    // ── B completes the item ──
    await pageB.goto("/shopping");
    await pageB.getByRole("button", { name: "علامت خریداری‌شده" }).first().click();

    // ── A logs a SHARED mood ──
    await pageA.goto("/relationship");
    await pageA.locator("button[role='radio']").first().click(); // 😊 great — always shared now
    await pageA.getByRole("button", { name: "ثبت", exact: true }).click();
    await expect(pageA.getByText("حال‌وهوای امروز ثبت شد")).toBeVisible({ timeout: 15_000 });

    // ── B sees A's shared mood in the shared list ──
    await pageB.goto("/relationship");
    // the list shows "میزیار... no — the OWNER's name is "میزبان تست"; B's own entries say "من"
    await expect(pageB.getByText("میزبان تست").first()).toBeVisible({ timeout: 20_000 });

    // ── B has a notification about A's expense ──
    await pageB.goto("/notifications");
    await expect(pageB.getByText("شام رستوران").first()).toBeVisible({ timeout: 20_000 });

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("Onboarding guards", () => {
  test("household-complete user reaching /onboarding is bounced to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("خریدهای ضروری")).toBeVisible({ timeout: 30_000 });
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
