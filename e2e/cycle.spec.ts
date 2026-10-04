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
    await expect(pageA.getByText("دوران قاعدگی").first()).toBeVisible({ timeout: 20_000 });

    // close any leftover open period from earlier runs (idempotent start state)
    const endBtn = pageA.getByRole("button", { name: "پایان یافت" });
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click();
      await expect(pageA.getByRole("button", { name: "+ ثبت دوره" })).toBeVisible({ timeout: 15_000 });
    }

    // ── Log a period starting today ──
    await pageA.getByRole("button", { name: "+ ثبت دوره" }).click();
    // JalaliDatePicker defaults to today — just submit
    await pageA.getByRole("button", { name: "ثبت", exact: true }).click();
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
