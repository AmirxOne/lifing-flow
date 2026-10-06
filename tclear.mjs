import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 120)));
await page.goto("http://localhost:3300/login");
await page.getByLabel("ایمیل").fill("test-owner@example.com");
await page.getByLabel("رمز عبور").fill("Pass1234");
await page.getByRole("button", { name: "ورود" }).click();
await page.waitForURL("**/dashboard", { timeout: 30000 });
await page.goto("http://localhost:3300/calendar");
await page.waitForTimeout(3500);

// open the log-period modal
await page.getByRole("button", { name: "+ ثبت دوره" }).click();
await page.waitForTimeout(800);

// the END date picker: find the second date-picker field inside the dialog
const endPicker = page.locator('[role="dialog"] button[aria-haspopup="dialog"]').nth(1);
await endPicker.click();
await page.waitForTimeout(600);
// pick a day (any enabled cell in the panel)
const dayBtn = page.locator('body > div button[aria-label*="مهر"], body > div [class*="grid"] button').filter({ hasText: /^\d+/ }).nth(10);
await dayBtn.click().catch(async () => {
  // fallback: click a numbered cell in the portalled panel
  const cells = page.locator('div [role="grid"] button, div .grid button');
  console.log("fallback cells:", await cells.count());
});
await page.waitForTimeout(500);
const endVal = await page.locator('[role="dialog"] button[aria-haspopup="dialog"]').nth(1).innerText();
console.log("end field after pick:", endVal.trim());

// now open again and click پاک کردن
await page.locator('[role="dialog"] button[aria-haspopup="dialog"]').nth(1).click();
await page.waitForTimeout(600);
const clearBtn = page.getByRole("button", { name: "پاک کردن" });
console.log("clear button visible:", await clearBtn.isVisible().catch(() => false) ? "YES ✓" : "NO ✗");
await clearBtn.click();
await page.waitForTimeout(500);
const after = await page.locator('[role="dialog"] button[aria-haspopup="dialog"]').nth(1).innerText();
console.log("end field after clear:", after.trim(), after.includes("انتخاب") || after.trim() === "" ? "→ EMPTY ✓" : "→ still has value ✗");
await browser.close();
