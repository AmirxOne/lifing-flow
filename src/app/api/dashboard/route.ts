import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { addDays, isoDateInTz } from "@/lib";
import { faNum } from "@/lib/fa";

const DAY = 86_400_000;

/** Tehran-safe start-of-day (server local midnight is NOT reliable). */
function tehranMidnight(offsetDays = 0): Date {
  const now = new Date();
  const iso = isoDateInTz(now); // "2026-10-06"
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + offsetDays * DAY);
}

export async function GET() {
  try {
    const { user, householdId } = await requireHousehold();

    const now = new Date();
    const todayStart = tehranMidnight(0);
    const todayEnd = tehranMidnight(1);
    const weekEnd = tehranMidnight(7);

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
      importantDates,
      recentShopping,
      provisions,
      periods,
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
        include: { addedBy: { select: { id: true, fullName: true } } },
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
        where: { householdId, date: { gte: addDays(todayStart, -30), lt: todayEnd } },
        select: { amount: true, payerId: true, isShared: true },
      }),
      // birthdays / anniversaries — yearly countdowns
      prisma.importantDate.findMany({ where: { householdId } }),
      // last 48h shopping activity for the live feed
      prisma.shoppingItem.findMany({
        where: { householdId, updatedAt: { gte: addDays(now, -2) } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { addedBy: { select: { id: true, fullName: true } } },
      }),
      // pending monthly provisions (any month, oldest first)
      prisma.monthlyProvision.findMany({
        where: { householdId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 4,
      }),
      prisma.cyclePeriod.findMany({
        where: { householdId },
        orderBy: { start: "asc" },
      }),
    ]);

    // balance: shared expenses split 50/50 over the last 30 days
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

    // ─── upcoming important dates (birthdays / anniversaries) with countdown ───
    const todayIso = isoDateInTz(now);
    const tY = Number(todayIso.slice(0, 4));
    const tM = Number(todayIso.slice(5, 7));
    const tD = Number(todayIso.slice(8, 10));
    const todayMs = Date.UTC(tY, tM - 1, tD);

    const upcoming = importantDates
      .map((d) => {
        const iso = isoDateInTz(d.date);
        const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), dd = Number(iso.slice(8, 10));
        let next = Date.UTC(tY, m - 1, dd);
        if (d.repeatsYearly) {
          if (next < todayMs) next = Date.UTC(tY + 1, m - 1, dd);
        } else if (next < todayMs) return null;
        const days = Math.round((next - todayMs) / DAY);
        return { id: d.id, title: d.title, kind: d.kind, date: iso, days };
      })
      .filter((x): x is { id: string; title: string; kind: string; date: string; days: number } => x !== null)
      .filter((x) => x.days <= 45)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3);

    // ─── live activity feed (last 48h, newest first) ───
    const feed: Array<{ icon: string; text: string; at: string }> = [];
    for (const e of todayExpenses.slice(0, 4)) {
      const who = e.payer.id === user.id ? "شما" : e.payer.fullName;
      feed.push({ icon: "💸", text: `${who} «${e.title}» را ثبت کرد`, at: e.createdAt.toISOString() });
    }
    for (const it of recentShopping) {
      const who = it.addedBy ? (it.addedBy.id === user.id ? "شما" : it.addedBy.fullName) : "همسرتان";
      feed.push({ icon: "🛒", text: `${who} «${it.title}» را به لیست خرید اضافه کرد`, at: it.updatedAt.toISOString() });
    }
    if (partnerMoodRow) {
      feed.push({
        icon: "💭",
        text: `حال‌وهوای ${partnerMoodRow.user.fullName} امروز ثبت شد`,
        at: partnerMoodRow.updatedAt.toISOString(),
      });
    }
    const partnerOpenTasks = todayTasks.filter((t) => t.assignedTo && t.assignedTo.id !== user.id).length;
    if (partnerOpenTasks > 0) {
      feed.push({
        icon: "✅",
        text: `${partner?.fullName ?? "همسرتان"} ${faNum(partnerOpenTasks)} کارِ باز دارد`,
        at: todayStart.toISOString(),
      });
    }
    feed.sort((a, b) => b.at.localeCompare(a.at));

    // ─── cycle care snapshot ───
    let cycle: { daysToNext: number; phase: string; cycleLen: number } | null = null;
    if (periods.length > 0) {
      const starts = periods.map((p) => p.start.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < starts.length; i++) {
        const g = (starts[i] - starts[i - 1]) / DAY;
        if (g >= 15 && g <= 60) gaps.push(g);
      }
      const cycleLen = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : 28;
      const last = periods[periods.length - 1];
      const today = todayStart.getTime();
      const d = (today - last.start.getTime()) / DAY;
      if (d >= 0 && d <= cycleLen + 7) {
        const nextMs = last.start.getTime() + cycleLen * DAY;
        const daysToNext = Math.round((nextMs - today) / DAY);
        const phase = d < 5 ? "PERIOD" : d < cycleLen - 4 ? "FOLLICULAR" : "LUTEAL";
        cycle = { daysToNext: Math.max(0, daysToNext), phase, cycleLen };
      }
    }

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
      week: { expensesTotal: weekExpenses._sum.amount ?? 0 },
      shopping: pendingShopping.map((s) => ({ id: s.id, title: s.title, priority: s.priority, addedBy: s.addedBy?.fullName ?? "" })),
      provisions: provisions.map((p) => ({ id: p.id, title: p.title })),
      goals: goalsWithProgress,
      balance,
      partner,
      upcoming,
      feed: feed.slice(0, 8),
      cycle,
      date: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[dashboard]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
