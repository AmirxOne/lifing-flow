import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { addDays } from "@/lib";

export async function GET() {
  try {
    const { user, householdId } = await requireHousehold();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = addDays(todayStart, 1);
    const weekEnd = addDays(todayStart, 7);

    const [
      todayExpenses,
      weekExpenses,
      todayTasks,
      upcomingEvents,
      pendingShopping,
      goals,
      myMood,
      partnerMoodRow,
      partner,
      monthExpenses,
    ] = await Promise.all([
      prisma.expense.findMany({
        where: { householdId, date: { gte: todayStart, lt: todayEnd } },
        include: { payer: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.aggregate({
        where: { householdId, date: { gte: todayStart, lt: weekEnd } },
        _sum: { amount: true },
      }),
      prisma.task.findMany({
        where: { householdId, status: "OPEN", OR: [{ dueDate: null }, { dueDate: { lt: todayEnd } }] },
        include: { assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } } },
        take: 10,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      }),
      prisma.eventModel.findMany({
        where: { householdId, date: { gte: todayStart, lt: weekEnd } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 10,
      }),
      prisma.shoppingItem.findMany({
        where: { householdId, completed: false },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 8,
      }),
      prisma.goal.findMany({
        where: { householdId, completedAt: null },
        include: { contributions: { select: { amount: true } } },
        take: 4,
        orderBy: { createdAt: "desc" },
      }),
      prisma.mood.findFirst({
        where: { householdId, userId: user.id, date: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.mood.findFirst({
        where: { householdId, visibility: "SHARED", date: { gte: todayStart, lt: todayEnd }, user: { id: { not: user.id } } },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      prisma.user.findFirst({
        where: { householdId, id: { not: user.id } },
        select: { id: true, fullName: true, avatarEmoji: true },
      }),
      prisma.expense.findMany({
        where: { householdId },
        select: { amount: true, payerId: true, isShared: true },
      }),
    ]);

    // balance: shared expenses split 50/50
    let owed = 0; // >0 → partner owes me; <0 → I owe partner
    for (const e of monthExpenses) {
      if (!e.isShared) continue;
      const half = e.amount / 2;
      if (e.payerId === user.id) owed += half;
      else owed -= half;
    }
    const balance = {
      amount: Math.abs(owed),
      direction: owed > 0 ? "PARTNER_OWES_ME" : owed < 0 ? "I_OWE_PARTNER" : "EVEN",
    };

    const goalsWithProgress = goals.map((g) => {
      const saved = g.contributions.reduce((s, c) => s + c.amount, 0);
      return { id: g.id, title: g.title, targetAmount: g.targetAmount, saved, pct: g.targetAmount > 0 ? Math.min(100, Math.round((saved / g.targetAmount) * 100)) : 0 };
    });

    return ok({
      today: {
        expenses: todayExpenses.map((e) => ({ id: e.id, title: e.title, amount: e.amount, category: e.category, payer: e.payer.fullName })),
        expensesTotal: todayExpenses.reduce((s, e) => s + e.amount, 0),
        tasks: todayTasks,
        events: upcomingEvents,
        myMood: myMood,
        partnerMood: partnerMoodRow,
      },
      week: {
        expensesTotal: weekExpenses._sum.amount ?? 0,
      },
      shopping: pendingShopping,
      goals: goalsWithProgress,
      balance,
      partner,
      date: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[dashboard]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
