import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { jalaliPartsInTz } from "@/lib";

const askSchema = z.object({
  mode: z.enum(["ASK", "MEAL_PLAN", "SHOPPING", "DATE_NIGHT", "FINANCE"]).default("ASK"),
  question: z.string().trim().min(1, "پرسش را وارد کنید").max(500),
  budget: z.number().int().min(0).max(9_999_999_999).optional(),
});

interface Insight {
  kind: string;
  text: string;
}

/** Deterministic household-data analyzer — no external LLM needed (zero-cost).
 *  Every insight is computed from real rows; nothing fabricated. */
function analyzeFinance(expenses: Array<{ title: string; amount: number; category: string; date: Date }>): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const p = jalaliPartsInTz(now, "Asia/Tehran");

  const thisMonth = expenses.filter((e) => {
    const j = jalaliPartsInTz(e.date, "Asia/Tehran");
    return j.jy === p.jy && j.jm === p.jm;
  });
  const pm = p.jm === 1 ? { jy: p.jy - 1, jm: 12 } : { jy: p.jy, jm: p.jm - 1 };
  const prevP = pm;
  const lastMonth = expenses.filter((e) => {
    const j = jalaliPartsInTz(e.date, "Asia/Tehran");
    return j.jy === prevP.jy && j.jm === prevP.jm;
  });

  const total = thisMonth.reduce((s, e) => s + e.amount, 0);
  const lastTotal = lastMonth.reduce((s, e) => s + e.amount, 0);
  if (total > 0) {
    insights.push({ kind: "TOTAL", text: `مجموع هزینه‌های این ماه: ${new Intl.NumberFormat("fa-IR").format(total)} تومان` });
  }
  if (lastTotal > 0 && total > 0) {
    const delta = Math.round(((total - lastTotal) / lastTotal) * 100);
    if (delta !== 0) {
      insights.push({ kind: "TREND", text: `هزینه‌های این ماه نسبت به ماه قبل ${delta > 0 ? `${new Intl.NumberFormat("fa-IR").format(Math.abs(delta))}٪ بیشتر` : `${new Intl.NumberFormat("fa-IR").format(Math.abs(delta))}٪ کمتر`} شده است` });
    }
  }

  const byCat = new Map<string, number>();
  for (const e of thisMonth) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const FA: Record<string, string> = { FOOD: "خوراک", HOME: "خانه", TRANSPORT: "حمل‌ونقل", FUN: "تفریح", SHOPPING: "خرید", MEDICAL: "درمان", BILLS: "قبض", TRAVEL: "سفر", CLOTHES: "پوشاک", OTHER: "سایر" };
    insights.push({ kind: "TOP_CATEGORY", text: `بیشترین هزینه این ماه: ${FA[topCat[0]] ?? topCat[0]} با ${new Intl.NumberFormat("fa-IR").format(topCat[1])} تومان` });
  }

  return insights;
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const { mode, question, budget } = parsed.data;

    // Context: ONLY household-scoped, non-private data
    const [expenses, tasks, shopping, goals, meals, partner] = await Promise.all([
      prisma.expense.findMany({
        where: { householdId },
        select: { title: true, amount: true, category: true, date: true, payerId: true, isShared: true },
        orderBy: { date: "desc" },
        take: 200,
      }),
      prisma.task.findMany({ where: { householdId, status: "OPEN" }, select: { title: true, dueDate: true, assignedToId: true }, take: 30 }),
      prisma.shoppingItem.findMany({ where: { householdId, completed: false }, select: { title: true, priority: true }, take: 30 }),
      prisma.goal.findMany({ where: { householdId, completedAt: null }, select: { title: true, targetAmount: true, contributions: { select: { amount: true } } }, take: 10 }),
      prisma.mealEntry.findMany({ where: { householdId }, select: { date: true, slot: true, title: true, ingredients: true }, orderBy: { date: "desc" }, take: 28 }),
      prisma.user.findFirst({ where: { householdId, id: { not: user.id } }, select: { fullName: true } }),
    ]);

    let answer = "";
    const data: Record<string, unknown> = {};

    if (mode === "FINANCE" || (mode === "ASK" && /هزینه|خرج|مصرف|مالی|بودجه/.test(question))) {
      const insights = analyzeFinance(expenses);
      answer = insights.length
        ? `تحلیل هزینه‌های شما:\n${insights.map((i) => `• ${i.text}`).join("\n")}`
        : "هنوز هزینه‌ای ثبت نشده که بتوانم تحلیل کنم.";
      data.insights = insights;
    } else if (mode === "MEAL_PLAN" || (mode === "ASK" && /غذا|برنامه غذایی|شام|ناهار/.test(question))) {
      const recentTitles = [...new Set(meals.map((m) => m.title))].slice(0, 8);
      const pool = recentTitles.length >= 3
        ? recentTitles
        : ["قورمه‌سبزی", "زرشک‌پلو با مرغ", "خورشت لوبیا", "ماکارونی", "املت گوجه", "کوکو سبزی", "عدس‌پلو", "استانبولی پلو"];
      const plan = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
        dayOffset: i,
        lunch: pool[i % pool.length],
        dinner: pool[(i + 3) % pool.length],
      }));
      answer = `برنامه غذایی هفته آینده:\n${plan.map((d) => `روز ${new Intl.NumberFormat("fa-IR").format(d.dayOffset + 1)}: ناهار ${d.lunch} — شام ${d.dinner}`).join("\n")}`;
      data.mealPlan = plan;
    } else if (mode === "SHOPPING" || (mode === "ASK" && /لیست خرید|خرید/.test(question))) {
      const current = shopping.map((s) => s.title);
      const fromMeals = meals
        .flatMap((m) => (m.ingredients as Array<{ name: string }> | null) ?? [])
        .map((i) => i.name)
        .filter((n) => !current.includes(n));
      const unique = [...new Set(fromMeals)].slice(0, 15);
      answer = unique.length
        ? `بر اساس برنامه غذایی، این موارد را به لیست خرید اضافه کنید:\n${unique.map((u) => `• ${u}`).join("\n")}`
        : "لیست خرید شما به‌روز است یا مواد اولیه‌ای در برنامه غذایی ثبت نشده است.";
      data.suggestedItems = unique;
    } else if (mode === "DATE_NIGHT" || (mode === "ASK" && /قرار|دونفره|دیت/.test(question))) {
      const b = budget ?? 500000;
      const ideas = b >= 2000000
        ? [{ title: "شام در رستوران محبوبتان", budget: b }, { title: "بلیت سینما + کافه", budget: Math.round(b * 0.5) }]
        : b >= 500000
          ? [{ title: "پیک‌نیک عصرگاهی در پارک", budget: 300000 }, { title: "دورهمی سینما در خانه + غذای بیرونی", budget: b }]
          : [{ title: "پیاده‌روی عصرگاهی + بستنی", budget: 100000 }, { title: "شب بازی رومیزی در خانه", budget: 0 }];
      answer = `با بودجه ${new Intl.NumberFormat("fa-IR").format(b)} تومان:\n${ideas.map((i) => `• ${i.title}${i.budget ? ` — حدود ${new Intl.NumberFormat("fa-IR").format(i.budget)} تومان` : " — رایگان"}`).join("\n")}`;
      data.dateIdeas = ideas;
    } else {
      // general household summary
      const openTasks = tasks.length;
      const pendingShopping = shopping.length;
      const openGoals = goals.map((g) => {
        const saved = g.contributions.reduce((s, c) => s + c.amount, 0);
        return `${g.title} (${new Intl.NumberFormat("fa-IR").format(Math.round(g.targetAmount > 0 ? (saved / g.targetAmount) * 100 : 0))}٪)`;
      });
      answer = `خلاصه وضعیت خانه:\n• کارهای باز: ${new Intl.NumberFormat("fa-IR").format(openTasks)} مورد\n• اقلام در انتظار خرید: ${new Intl.NumberFormat("fa-IR").format(pendingShopping)} مورد\n${openGoals.length ? `• اهداف جاری: ${openGoals.join("، ")}` : "• هنوز هدفی ثبت نشده"}`;
      data.summary = { openTasks, pendingShopping, openGoals: goals.length };
    }

    // persist chat (answer is deterministic from real data — schema-safe)
    const chat = await prisma.aiChat.create({
      data: { householdId, userId: user.id, question, answer, mode, data: data as object },
    });

    return ok({ id: chat.id, answer, data }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[ai]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const items = await prisma.aiChat.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[ai history]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
