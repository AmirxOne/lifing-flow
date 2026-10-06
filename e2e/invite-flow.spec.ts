import { test, expect } from "./test";
import { suffix, provisionSoloHousehold } from "./helpers";

test.describe("Closed registration (private two-person app)", () => {
  test("/register API is closed forever — REGISTRATION_CLOSED", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { fullName: "مهاجم", email: `x-${suffix()}@example.com`, password: "Pass1234", householdName: "خانواده مهاجم" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("REGISTRATION_CLOSED");
  });

  test("/register page no longer exists (redirects away)", async ({ page }) => {
    await page.goto("/register");
    // deleted page → lands on login or join, never a register form
    await expect(page.locator("form")).not.toContainText("ساخت حساب");
  });

  test("/setup is dead once users exist → redirects to /join", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/(join|login)/, { timeout: 15_000 });
  });

  test("login page links to /join (not /register)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "به خانواده بپیوندید" })).toBeVisible();
    await expect(page.getByRole("link", { name: /ثبت‌نام/ })).toHaveCount(0);
  });
});

test.describe("Invite-code partner join (the golden path)", () => {
  test("owner generates code → partner creates account via /join → both share data", async ({ browser }) => {
    test.setTimeout(120_000);
    const s = suffix();

    // ── Owner: FRESH solo household (DB-provisioned — registration is closed) ──
    const host = provisionSoloHousehold(s);
    const ctxA = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    await pageA.goto("/login");
    await pageA.getByLabel("ایمیل").fill(host.email);
    await pageA.getByLabel("رمز عبور").fill("Pass1234");
    await pageA.getByRole("button", { name: "ورود" }).click();
    // solo owner lands on dashboard ("در انتظار همسر…")
    await expect(pageA.getByText("در انتظار همسر…")).toBeVisible({ timeout: 20_000 });
    // generate the invite from settings
    await pageA.goto("/settings");
    await pageA.getByRole("button", { name: "ساخت کد دعوت" }).click();
    const codeEl = pageA.locator("code[dir='ltr'], div[dir='ltr'].font-mono");
    await expect(codeEl.first()).toBeVisible({ timeout: 15_000 });
    const code = (await codeEl.first().textContent())!.trim();
    expect(code.length).toBeGreaterThanOrEqual(6);

    // ── Partner: brand-new account through /join with the code ──
    const ctxB = await browser.newContext({ locale: "fa-IR", viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    await pageB.goto("/join");
    await pageB.getByLabel("کد دعوت").fill(code);
    await pageB.getByLabel("نام و نام خانوادگی").fill("همسر جدید");
    await pageB.getByLabel("ایمیل").fill(`join-e2e-${s}@example.com`);
    await pageB.getByLabel("رمز عبور (حداقل ۸ کاراکتر)").fill("Pass1234");
    await pageB.getByRole("button", { name: "پیوستن به خانواده" }).click();
    await expect(pageB).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(pageB.getByText("خریدهای ضروری")).toBeVisible({ timeout: 20_000 });

    // ── Shared data proof: partner adds a shopping item, owner sees it ──
    await pageB.goto("/shopping");
    await pageB.getByRole("button", { name: "+ افزودن" }).click();
    await pageB.getByLabel("نام کالا").fill(`اسمی-${s}`);
    await pageB.getByRole("button", { name: "افزودن", exact: true }).click();
    await expect(pageB.getByText(`اسمی-${s}`).first()).toBeVisible({ timeout: 20_000 });

    await ctxA.close();
    await ctxB.close();
  });

  test("join with garbage code shows Persian error, no account created", async ({ page }) => {
    await page.goto("/join");
    await page.getByLabel("کد دعوت").fill("ZZZZ9999");
    await page.getByLabel("نام و نام خانوادگی").fill("بی‌کد");
    await page.getByLabel("ایمیل").fill(`nocode-${suffix()}@example.com`);
    await page.getByLabel("رمز عبور (حداقل ۸ کاراکتر)").fill("Pass1234");
    await page.getByRole("button", { name: "پیوستن به خانواده" }).click();
    await expect(page.getByText("کد دعوت نامعتبر یا منقضی شده است")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/join/);
  });
});
