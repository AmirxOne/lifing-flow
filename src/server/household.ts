import { prisma } from "@/server/db";

/**
 * Shared helpers for household-scoped routes.
 * SECURITY: every list/find MUST filter by householdId from the session —
 * never from a client-provided field.
 */

export async function householdMembers(householdId: string) {
  return prisma.user.findMany({
    where: { householdId },
    select: { id: true, fullName: true, avatarEmoji: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Verify an id belongs to the household before linking (assign etc.). */
export async function isMember(householdId: string, userId: string): Promise<boolean> {
  const u = await prisma.user.findFirst({ where: { id: userId, householdId }, select: { id: true } });
  return !!u;
}

/** Log a household activity row + fan-out notifications to the other member. */
export async function logActivity(opts: {
  householdId: string;
  userId: string;
  type: string;
  summary: string;
  entityId?: string;
  notifyPartner?: boolean;
  notifType?: string;
  notifTitle?: string;
  notifBody?: string;
  notifLink?: string;
}) {
  const {
    householdId, userId, type, summary, entityId,
    notifyPartner = true, notifType = "ACTIVITY", notifTitle, notifBody, notifLink,
  } = opts;
  await prisma.activity.create({
    data: { householdId, userId, type, summary, entityId },
  }).catch(() => {});
  if (!notifyPartner) return;
  const others = await prisma.user.findMany({
    where: { householdId, id: { not: userId } },
    select: { id: true },
  });
  if (others.length === 0) return;
  await prisma.notification.createMany({
    data: others.map((o) => ({
      userId: o.id,
      householdId,
      type: notifType,
      title: notifTitle ?? summary,
      body: notifBody ?? null,
      link: notifLink ?? null,
    })),
  }).catch(() => {});
}
