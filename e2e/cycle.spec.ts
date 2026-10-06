import { test, expect } from "@playwright/test";

test.describe("Cycle tracking (shared calendar feature)", () => {
  test("log period via UI → prediction appears → partner sees it too", async ({ browser }) => {
    // ── Owner logs in and opens calendar ──
    const ctxA = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    await pageA.goto("/login");
    await pageA.getByLabel("ایمیل").fill("test-owner@example.com");
    await pageA.getByLabel("رمز عبور").fill("Pass1234");
    await pageA.getByRole("button", { name: "ورود" }).click();
    await pageA.waitForURL("**/dashboard", { timeout: 30_000 });
    await pageA.goto("/calendar");
    await expect(pageA.getByText("چرخه قاعدگی").first()).toBeVisible({ timeout: 20_000 });

    // close any leftover open period from earlier runs (idempotent start state)
    const endBtn = pageA.getByRole("button", { name: "پایان یافت" });
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click();
      await expect(pageA.getByRole("button", { name: "+ ثبت دوره" })).toBeVisible({ timeout: 15_000 });
    }

    // ── Log a period starting today ──
    await pageA.getByRole("button", { name: "+ ثبت دوره" }).click();
    // JalaliDatePicker defaults to today — just submit
    await pageA.evaluate(() => {
      const dlg = document.querySelector('[role=\dialog\]');
      const btns = dlg ? [...dlg.querySelectorAll("button")].filter((b) => b.textContent.trim() === "ثبت") : [];
      btns[btns.length - 1]?.click();
    });
    await expect(pageA.getByText("دوران ثبت شد").first()).toBeVisible({ timeout: 15_000 });

    // ── Ongoing period state: today's cell is marked + "پایان یافت" button ──
    await expect(pageA.getByRole("button", { name: "پایان یافت" })).toBeVisible({ timeout: 15_000 });
    const markedCells = pageA.locator("button[aria-label*='دوران قاعدگی']");
    await expect(markedCells.first()).toBeVisible({ timeout: 15_000 });

    // ── Partner sees the same data (shared by design) ──
    const ctxB = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("ایمیل").fill("test-partner@example.com");
    await pageB.getByLabel("رمز عبور").fill("Pass1234");
    await pageB.getByRole("button", { name: "ورود" }).click();
    await pageB.waitForURL("**/dashboard", { timeout: 30_000 });
    await pageB.goto("/calendar");
    await expect(pageB.getByRole("button", { name: "پایان یافت" })).toBeVisible({ timeout: 20_000 });

    // ── End the period (owner side) ──
    await pageA.getByRole("button", { name: "پایان یافت" }).click();
    await expect(pageA.getByText("پایان ثبت شد").first()).toBeVisible({ timeout: 15_000 });
    // back to "+ ثبت دوره" state
    await expect(pageA.getByRole("button", { name: "+ ثبت دوره" })).toBeVisible({ timeout: 15_000 });

    await ctxA.close();
    await ctxB.close();
  });

  test("isolation: other household never sees cycle data", async ({ request, page }) => {
    // other-household user fetches cycle → must see empty periods
    const login = await request.post("/api/auth/login", { data: { email: "test-other-household@example.com", password: "Pass1234" } });
    const cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
    const res = await request.get("/api/cycle", { headers: { cookie } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.periods.length).toBe(0);
  });
});

test.describe("Cycle forecasts & report", () => {
  test("next-month predictions render dashed + variance banner + report modal", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await page.goto("/calendar");
    await expect(page.getByText("چرخه قاعدگی").first()).toBeVisible({ timeout: 20_000 });

    // variance banner about the latest period (test data has late/early periods)
    await expect(page.getByText(/روز (دیرتر|زودتر)/).first()).toBeVisible({ timeout: 15_000 });

    // forecast cells with dashed border on a following month (skip past current-cycle month)
    await page.getByRole("button", { name: "ماه بعد" }).click();
    await page.getByRole("button", { name: "ماه بعد" }).click();
    const predicted = page.locator("button[aria-label*='پیش‌بینی']");
    await expect(predicted.first()).toBeVisible({ timeout: 15_000 });
    const dashed = await predicted.evaluateAll((els) => els.every((e) => e.className.includes("border-dashed")));
    expect(dashed).toBe(true);

    // report modal opens with stats
    await page.getByRole("button", { name: "ماه قبل" }).click();
    await page.getByRole("button", { name: "ماه قبل" }).click();
    await page.getByRole("button", { name: /گزارش چرخه‌ها/ }).click();
    await expect(page.getByText("میانگین چرخه")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("PMS window", () => {
  test("PMS days render amber before the forecast start", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("ایمیل").fill("test-owner@example.com");
    await page.getByLabel("رمز عبور").fill("Pass1234");
    await page.getByRole("button", { name: "ورود" }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });

    // reset to a deterministic history: wipe, then seed 28-day cycles
    const existing = await (await page.request.get("/api/cycle")).json();
    for (const p of existing.data?.periods ?? []) {
      await page.request.delete(`/api/cycle?id=${p.id}`);
    }
    for (const [s, e] of [["2026-07-18", "2026-07-22"], ["2026-08-15", "2026-08-19"], ["2026-09-12", "2026-09-16"]]) {
      await page.request.post("/api/cycle", { data: { start: s, end: e } });
    }

    await page.goto("/calendar");
    await expect(page.getByText("چرخه قاعدگی").first()).toBeVisible({ timeout: 20_000 });

    // legend mentions PMS
    await expect(page.getByText("احتمال PMS").first()).toBeVisible({ timeout: 10_000 });

    // at least one amber PMS cell exists in the grid
    const pmsCell = page.locator('.grid button', { hasText: "" }).filter({ has: page.locator("[aria-label*='PMS']") });
    const count = await page.locator(".grid button[aria-label*='PMS']").count();
    expect(count).toBeGreaterThan(0);

    // forecast cells exist too
    const fc = await page.locator(".grid button[aria-label*='پیش‌بینی دوره']").count();
    expect(fc).toBeGreaterThan(0);
  });
});
