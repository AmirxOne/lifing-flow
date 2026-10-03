import { test, expect } from "@playwright/test";

test.describe("Design system laws (LAW: ظاهر = MeetingHub، اعداد = فارسی، پول = تومان)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("خرید هفتگی سوپرمارکت").first()).toBeVisible({ timeout: 30_000 });
  });

  test("no latin digits anywhere on dashboard", async ({ page }) => {
    const body = await page.locator("main").innerText();
    // allow latin only in dir=ltr islands (none on dashboard) — assert no bare latin numbers
    const latinNums = body.match(/(?<![a-zA-Z0-9])[0-9]+(?![a-zA-Z0-9])/g) ?? [];
    expect(latinNums, `found latin digits: ${latinNums.join(",")}`).toHaveLength(0);
  });

  test("every price shows تومان and never ریال", async ({ page }) => {
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("ریال");
    expect(body).toContain("تومان");
  });

  test("app shell never exceeds 600px on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const shellWidth = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? Math.round(main.getBoundingClientRect().width) : -1;
    });
    expect(shellWidth).toBeLessThanOrEqual(600);
    // centered horizontally
    const left = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return Math.round(main.getBoundingClientRect().left);
    });
    expect(left).toBeGreaterThanOrEqual((1440 - 600) / 2 - 2);
  });

  test("bottom navigation renders with 5 items and active state", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "ناوبری اصلی" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("link", { name: "داشبورد" })).toHaveAttribute("aria-current", "page");
  });

  test("340px narrow viewport: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 700 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("calendar shows Jalali month names and Persian digits", async ({ page }) => {
    await page.getByRole("link", { name: "تقویم" }).first().click();
    await expect(page.getByText(/مهر|آبان|آذر|دی|بهمن|اسفند|فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور/).first()).toBeVisible({ timeout: 20_000 });
    const monthTitle = await page.locator("main .font-black").first().innerText();
    expect(monthTitle).not.toMatch(/[0-9]{4}/); // year must be Persian digits
  });

  test("finance page: amount entry uses Persian keypad (fa input)", async ({ page }) => {
    await page.getByRole("link", { name: "مالی" }).first().click();
    await page.getByRole("button", { name: "+ هزینه جدید" }).click();
    const amount = page.getByLabel("مبلغ (تومان)");
    await expect(amount).toBeVisible();
    const inputMode = await amount.getAttribute("inputmode");
    expect(inputMode).toBeTruthy();
  });
});

test.describe("Loading / empty states", () => {
  test("fresh household sees proper empty states everywhere", async ({ page, browser }) => {
    const s = `${Date.now().toString(36)}e2e`;
    const ctx = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto("/register");
    await p.getByLabel("نام و نام خانوادگی").fill("خالی");
    await p.getByLabel("ایمیل").fill(`empty-${s}@example.com`);
    await p.getByLabel("رمز عبور").fill("Pass1234");
    await p.getByRole("button", { name: "ساخت حساب" }).click();
    await p.getByRole("button", { name: "🏡 خانواده جدید بسازم" }).click();
    await p.getByLabel("نام خانواده").fill(`خالی ${s}`);
    await p.getByRole("button", { name: "ساخت خانواده" }).click();
    await p.getByRole("button", { name: "فعلاً بعداً — برو به داشبورد" }).click();
    await expect(p.getByText("هنوز هزینه‌ای ثبت نشده")).toBeVisible({ timeout: 30_000 });
    await p.goto("/shopping");
    await expect(p.getByText("لیست خرید خالی است")).toBeVisible({ timeout: 20_000 });
    await p.goto("/goals");
    await expect(p.getByText("هنوز هدفی ندارید")).toBeVisible({ timeout: 20_000 });
    await p.goto("/memories");
    await expect(p.getByText("هنوز خاطره‌ای ندارید")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });
});
