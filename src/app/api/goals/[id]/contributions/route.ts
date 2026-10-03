import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";

type Params = { params: Promise<{ id: string }> };

const contribSchema = z.object({
  amount: z.number().int().positive("مبلغ باید مثبت باشد").max(9_999_999_999),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const goal = await prisma.goal.findFirst({
      where: { id, householdId },
      include: { contributions: { select: { amount: true } } },
    });
    if (!goal) return fail(404, "هدف پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = contribSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const contrib = await prisma.goalContribution.create({
      data: { goalId: goal.id, userId: user.id, amount: parsed.data.amount, note: parsed.data.note ?? null },
    });

    const saved = goal.contributions.reduce((s, c) => s + c.amount, 0) + parsed.data.amount;
    const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((saved / goal.targetAmount) * 100)) : 0;
    const completed = !goal.completedAt && pct >= 100;
    if (completed) {
      await prisma.goal.update({ where: { id: goal.id }, data: { completedAt: new Date() } });
    }

    await logActivity({
      householdId,
      userId: user.id,
      type: completed ? "GOAL_COMPLETED" : "GOAL_CONTRIB",
      summary: completed
        ? `هدف «${goal.title}» تکمیل شد 🎉`
        : `${user.fullName} به هدف «${goal.title}» پس‌انداز کرد`,
      entityId: goal.id,
      notifType: "GOAL",
      notifTitle: completed ? "هدف تکمیل شد 🎉" : "پس‌انداز جدید",
      notifLink: "/goals",
    });

    return ok({ contribution: contrib, saved, pct, completed }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[goal contrib]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
