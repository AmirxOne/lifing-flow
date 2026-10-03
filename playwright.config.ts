import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_BASE ?? "http://localhost:3300",
    channel: "chrome", // system Chrome — Playwright CDN downloads fail on this machine
    locale: "fa-IR",
    viewport: { width: 390, height: 844 }, // mobile-first
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
