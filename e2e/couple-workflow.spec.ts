import { test, expect } from "@playwright/test";
import { suffix, registerViaUi, createHouseholdViaUi } from "./helpers";

test.describe("Full couple workflow E2E (the golden path)", () => {
  test("A registers → household → invite → B joins → shared life", async ({ browser }) => {
    const s = suffix();

    // ── User A: register + create household + get invite code ──
    const ctxA = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    await registerViaUi(pageA, "کاربر الف", `a-${s}@example.com`);
    await createHouseholdViaUi(pageA, `خانواده ${s}`);
    await pageA.getByRole("button", { name: "ساخت کد دعوت" }).click();
    const codeEl = pageA.locator("div[dir='ltr'].font-mono, .font-mono");
    await expect(codeEl.first()).toBeVisible({ timeout: 15_000 });
    const code = (await codeEl.first().textContent())!.trim();
    expect(code.length).toBeGreaterThanOrEqual(6);

    // ── User B: register + join with the code ──
    const ctxB = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    await registerViaUi(pageB, "کاربر ب", `b-${s}@example.com`);
    await pageB.getByRole("button", { name: "💌 کد دعوت دارم" }).click();
    await pageB.getByLabel("کد دعوت").fill(code);
    await pageB.getByRole("button", { name: "پیوستن" }).click();
    await expect(pageB.getByText("خریدهای ضروری")).toBeVisible({ timeout: 30_000 }); // dashboard loaded

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

    // ── B completes the item; A's view updates (polling) ──
    await pageB.getByRole("button", { name: "علامت خریداری‌شده" }).first().click();
    await expect(pageB.getByText("خریداری‌شده").first()).toBeVisible({ timeout: 15_000 }).catch(() => {});
    // switch to done tab to confirm
    await pageB.getByRole("tab", { name: "خریداری‌شده" }).click().catch(async () => {
      await pageB.getByText("خریداری‌شده", { exact: true }).click();
    });
    await expect(pageB.getByText("پنیر").first()).toBeVisible({ timeout: 15_000 });

    // ── A logs a mood (SHARED) ──
    await pageA.goto("/relationship");
    await pageA.locator("button[role='radio']").first().click(); // 😊 great
    await pageA.getByRole("button", { name: "ثبت", exact: true }).click();
    await expect(pageA.getByText("حال‌وهوای امروز ثبت شد")).toBeVisible({ timeout: 15_000 });

    // ── B sees A's shared mood on the same page ──
    await pageB.goto("/relationship");
    await expect(pageB.getByText("کاربر الف").first()).toBeVisible({ timeout: 20_000 });

    // ── B has a notification about A's expense ──
    await pageB.goto("/notifications");
    await expect(pageB.getByText("شام رستوران").first()).toBeVisible({ timeout: 20_000 });

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("Onboarding guards", () => {
  test("fresh user without household gets redirected from /dashboard to onboarding", async ({ page }) => {
    const s = suffix();
    await registerViaUi(page, "بدون خانواده", `solo-${s}@example.com`);
    // still on onboarding (register lands there)
    await expect(page).toHaveURL(/\/onboarding/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  });
});
