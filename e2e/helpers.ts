import { expect, type Page } from "@playwright/test";

export function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function loginViaUi(page: Page, email: string, password = "Pass1234"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

/**
 * Create a brand-new partner account through the invite flow (/join) —
 * the only registration path in this private app.
 */
export async function joinViaUi(page: Page, code: string, fullName: string, email: string, password = "Pass1234"): Promise<void> {
  await page.goto("/join");
  await page.getByLabel("کد دعوت").fill(code);
  await page.getByLabel("نام و نام خانوادگی").fill(fullName);
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور (حداقل ۸ کاراکتر)").fill(password);
  await page.getByRole("button", { name: "پیوستن به خانواده" }).click();
}


/**
 * Provision a FRESH solo household straight in the DB (like seed does —
 * public registration is closed by design) and return owner credentials.
 */
export function provisionSoloHousehold(tag: string): { email: string; password: string } {
  const email = `e2e-inviter-${tag}@example.com`;
  const script = [
    "const { PrismaClient } = require('@prisma/client');",
    "const bcrypt = require('bcryptjs');",
    "(async () => {",
    "  const prisma = new PrismaClient();",
    `  const email = ${JSON.stringify(email)};`,
    "  await prisma.user.deleteMany({ where: { email } }).catch(() => {});",
    `  const hh = await prisma.household.create({ data: { name: 'خانواده ' + ${JSON.stringify(tag)} } });`,
    "  await prisma.user.create({",
    "    data: { fullName: 'میزبان تست', email, passwordHash: await bcrypt.hash('Pass1234', 12), householdId: hh.id, onboardingDone: true },",
    "  });",
    "  await prisma.$disconnect();",
    "})().catch((e) => { console.error(e); process.exit(1); });",
  ].join(" ");
  const { execSync } = require("node:child_process");
  execSync(`node -e ${JSON.stringify(script)}`, { cwd: process.cwd(), stdio: "pipe" });
  return { email, password: "Pass1234" };
}

/** Get a fresh invite code from a FRESH DB-provisioned solo owner (via API). */
export async function newInviteCode(request: import("@playwright/test").APIRequestContext, ownerEmail?: string): Promise<string> {
  if (!ownerEmail) {
    ownerEmail = provisionSoloHousehold(`api${Date.now().toString(36)}`).email;
  }
  const login = await request.post("/api/auth/login", { data: { email: ownerEmail, password: "Pass1234" } });
  const cookie = (await login.headers()["set-cookie"] ?? "").split(";")[0];
  const res = await request.post("/api/household/invite", { headers: { cookie }, data: {} });
  const body = await res.json();
  if (!body?.data?.code) throw new Error(`invite failed: ${JSON.stringify(body)}`);
  return body.data.code as string;
}

/**
 * Click a button inside the currently-open dialog by its exact label.
 * Uses a native DOM click — Playwright's regular click gets intercepted by
 * the Next.js dev overlay on bottom-sheet footers in dev mode.
 */
export async function dialogButton(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.evaluate((lbl) => {
    const root = document.querySelector('[role="dialog"]') ?? document;
    const btns = [...root.querySelectorAll("button")].filter((b) => b.textContent.trim() === lbl);
    if (!btns.length) throw new Error(`dialog button "${lbl}" not found`);
    btns[btns.length - 1].click();
  }, label);
}
