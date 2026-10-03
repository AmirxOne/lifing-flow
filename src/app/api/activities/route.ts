import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const items = await prisma.activity.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, fullName: true, avatarEmoji: true } } },
      take: 60,
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[activities]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
