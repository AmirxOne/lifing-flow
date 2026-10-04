import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 150)));
await page.goto("http://localhost:3300/login");
await page.getByLabel("ایمیل").fill("test-owner@example.com");
await page.getByLabel("رمز عبور").fill("Pass1234");
await page.getByRole("button", { name: "ورود" }).click();
await page.waitForURL("**/dashboard", { timeout: 30000 });
await page.goto("http://localhost:3300/calendar");
await page.waitForTimeout(4000);
// variance banner + report link visible?
const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log("VARIANCE:", text.includes("دیرتر") || text.includes("زودتر") ? "SHOWN" : "hidden");
console.log("REPORT LINK:", text.includes("گزارش چرخه‌ها") ? "SHOWN" : "hidden");
// navigate to NEXT month (آذر = Nov-Dec, دی = Dec-Jan forecast should show)
for (let i = 0; i < 2; i++) {
  await page.getByRole("button", { name: "›" }).click();
  await page.waitForTimeout(600);
}
const dashed = await page.evaluate(() => {
  const cells = [...document.querySelectorAll("button[aria-label*='پیش‌بینی']")];
  return cells.map((c) => c.className.includes("border-dashed"));
});
console.log("next-month predicted cells:", dashed.length, "all dashed:", dashed.length > 0 && dashed.every(Boolean));
await browser.close();
