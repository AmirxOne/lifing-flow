// Direct-DB test fixtures — the ONLY way tests get extra households/users,
// mirroring what seed does. Public registration is closed (by design), so
// test households are provisioned at the DB layer, exactly like a seed script.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

// load .env (vitest doesn't do it automatically)
for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function getPrisma() {
  const { PrismaClient } = await import("@prisma/client");
  const g = globalThis as unknown as { __lhTestPrisma?: InstanceType<typeof PrismaClient> };
  return (g.__lhTestPrisma ??= new PrismaClient());
}

export const TEST_PASSWORD = "Pass1234";

export interface FixtureUser {
  id: string;
  email: string;
  fullName: string;
  cookie?: string;
}

/** A complete two-person household (owner + partner) with unique suffix. */
export async function fixtureHousehold(suffix: string): Promise<{
  householdId: string;
  owner: FixtureUser;
  partner: FixtureUser;
}> {
  const prisma = await getPrisma();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const hh = await prisma.household.create({
    data: { name: `خانواده ${suffix}`, avatarEmoji: "🏠" },
  });
  const mk = (fullName: string, email: string) =>
    prisma.user.create({
      data: { fullName, email, passwordHash, householdId: hh.id, onboardingDone: true },
      select: { id: true, email: true, fullName: true },
    });
  const owner = await mk(`مالک ${suffix}`, `fx-owner-${suffix}@example.com`);
  const partner = await mk(`همسر ${suffix}`, `fx-partner-${suffix}@example.com`);
  return { householdId: hh.id, owner, partner };
}

/** A one-person household — its owner can still invite (join-flow tests). */
export async function fixtureSoloHousehold(suffix: string): Promise<{ householdId: string; owner: FixtureUser }> {
  const prisma = await getPrisma();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const hh = await prisma.household.create({ data: { name: `خانواده تنها ${suffix}` } });
  const owner = await prisma.user.create({
    data: { fullName: `تنها ${suffix}`, email: `fx-solo-${suffix}@example.com`, passwordHash, householdId: hh.id, onboardingDone: true },
    select: { id: true, email: true, fullName: true },
  });
  return { householdId: hh.id, owner };
}

/** A user with NO household (onboarding/join-gate tests). */
export async function fixtureHouseholdlessUser(suffix: string): Promise<FixtureUser> {
  const prisma = await getPrisma();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  return prisma.user.create({
    data: { fullName: `بی‌خانواده ${suffix}`, email: `fx-none-${suffix}@example.com`, passwordHash, onboardingDone: false },
    select: { id: true, email: true, fullName: true },
  });
}
