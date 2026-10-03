import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";

export const SESSION_COOKIE = "lh_session";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarEmoji: string | null;
  role: string;
  onboardingDone: boolean;
  householdId: string | null;
  isSystemAdmin: boolean;
}

export function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}:${process.env.SESSION_SECRET ?? "dev"}`)
    .digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 168);
  const expiresAt = new Date(Date.now() + ttlHours * 3600000);
  await prisma.session.create({ data: { token: hashToken(token), userId, expiresAt } });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: hashToken(token) } });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    avatarEmoji: session.user.avatarEmoji,
    role: session.user.role,
    onboardingDone: session.user.onboardingDone,
    householdId: session.user.householdId,
    isSystemAdmin: session.user.role === "SYSTEM_ADMIN",
  };
}

/** Require an authenticated user or throw a 401-shaped sentinel. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "ابتدا وارد شوید", "UNAUTHORIZED");
  return user;
}

/**
 * THE security invariant of Life Hub: every household-scoped query goes
 * through this. Returns 404 (not 403) for foreign households so IDs can't
 * be probed.
 */
export async function requireHousehold(): Promise<{ user: AuthUser; householdId: string }> {
  const user = await requireUser();
  if (!user.householdId) throw new HttpError(400, "ابتدا خانواده خود را بسازید یا به آن بپیوندید", "NO_HOUSEHOLD");
  return { user, householdId: user.householdId };
}

/** Null-safe household read — for pages that must render for partner-less users. */
export async function getHouseholdContext() {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, householdId: user.householdId };
}
