import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto("http://localhost:3300/calendar");
// import the compiled lib through the page's own chunk is complex — replicate instead:
// toGregorian uses a binary search over ICU; test the full chain manually:
const out = await page.evaluate(async () => {
  const mod = await import("/_next/static/chunks/app/(app)/calendar/page.js").catch(() => null);
  return mod ? "loaded" : "no direct import";
});
console.log(out);
await browser.close();
