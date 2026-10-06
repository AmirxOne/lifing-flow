import { test as base, expect } from "@playwright/test";

/**
 * Auto fixture: strips the Next.js dev-overlay (<nextjs-portal>) on every
 * navigation. In dev mode it intercepts pointer events and breaks clicks
 * (bottom-sheet footers especially). Specs import { test, expect } from "./test".
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const strip = () => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
      const start = () => {
        strip();
        new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    });
    await use(page);
  },
});
export { expect };
