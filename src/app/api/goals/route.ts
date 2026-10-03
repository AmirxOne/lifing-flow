import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";

const goalSchema = z.object({
  title: z.string().trim().min(1, "عنوان هدف را وارد کنید").max(80),
  targetAmount: z.number().int().positive("مبلغ باید مثبت باشد").max(9_999_999_999),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const goals = await prisma.goal.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
      include: {
        contributions: {
          include: { user: { select: { id: true, fullName: true, avatarEmoji: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    const items = goals.map((g) => {
      const saved = g.contributions.reduce((s, c) => s + c.amount, 0);
      const pct = g.targetAmount > 0 ? Math.min(100, Math.round((saved / g.targetAmount) * 100)) : 0;
      return { ...g, saved, pct, done: !!g.completedAt || pct >= 100 };
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[goals list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = goalSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const goal = await prisma.goal.create({
      data: {
        householdId,
        title: d.title,
        targetAmount: d.targetAmount,
        deadline: d.deadline ? new Date(`${d.deadline}T00:00:00+03:30`) : null,
        note: d.note ?? null,
      },
      include: { contributions: true },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "GOAL_ADDED",
      summary: `${user.fullName} هدف «${goal.title}» را ساخت`,
      entityId: goal.id,
      notifType: "GOAL",
      notifTitle: "هدف جدید",
      notifLink: "/goals",
    });

    return ok({ ...goal, saved: 0, pct: 0, done: false }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[goal create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
