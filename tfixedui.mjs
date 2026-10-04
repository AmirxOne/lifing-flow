import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 120)));
await page.goto("http://localhost:3300/login");
await page.getByLabel("ایمیل").fill("test-owner@example.com");
await page.getByLabel("رمز عبور").fill("Pass1234");
await page.getByRole("button", { name: "ورود" }).click();
await page.waitForURL("**/dashboard", { timeout: 30000 });
await page.goto("http://localhost:3300/finance");
await page.waitForTimeout(2500);

// switch to fixed tab
await page.getByRole("tab", { name: "هزینه‌های ثابت" }).click();
await page.waitForTimeout(1500);
const empty = await page.getByText("هنوز هزینه ثابتی ندارید").isVisible().catch(() => false);
console.log("fixed tab empty state:", empty ? "YES ✓" : "no (has items)");

// add via modal
await page.getByRole("button", { name: "+ افزودن هزینه ثابت" }).first().click();
await page.getByLabel("عنوان", { exact: false }).fill("اجاره خونه");
await page.locator("#fixed-amount").fill("۸۰۰۰۰۰۰");
await page.getByRole("button", { name: "ذخیره" }).click();
await page.waitForTimeout(2000);

const row = page.locator("text=اجاره خونه").first();
console.log("rent row visible:", await row.isVisible().catch(() => false) ? "YES ✓" : "NO ✗");
const total = await page.getByText("جمع ثابت‌ها").isVisible().catch(() => false);
console.log("summary card:", total ? "YES ✓" : "NO ✗");

// tick it
await page.getByRole("button", { name: /^پرداخت اجاره خونه$/ }).click();
await page.waitForTimeout(2000);
const toast = await page.getByText("پرداخت شد").isVisible().catch(() => false);
console.log("pay tick works:", toast ? "YES ✓ (toast shown)" : "checking line-through…");
const struck = await page.locator("text=اجاره خونه").first().evaluate((el) => el.className.includes("line-through")).catch(() => false);
console.log("line-through after pay:", struck ? "YES ✓" : "NO ✗");
await page.screenshot({ path: "fixed-costs.png" });
await browser.close();
