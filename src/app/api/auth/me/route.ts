import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, HttpError } from "@/server/auth/session";

export async function GET() {
  try {
    const auth = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true, email: true, fullName: true, avatarEmoji: true,
        onboardingDone: true, householdId: true, role: true,
        household: {
          select: {
            id: true, name: true, avatarEmoji: true,
            users: {
              where: { id: { not: auth.id } } ,
              select: { id: true, fullName: true, avatarEmoji: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!user) return fail(401, "ابتدا وارد شوید", "UNAUTHORIZED");
    const partner = user.household?.users[0] ?? null;
    return ok({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarEmoji: user.avatarEmoji,
      onboardingDone: user.onboardingDone,
      householdId: user.householdId,
      isSystemAdmin: user.role === "SYSTEM_ADMIN",
      household: user.household ? { id: user.household.id, name: user.household.name, avatarEmoji: user.household.avatarEmoji, partner } : null,
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[me]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
