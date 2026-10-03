import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { EXPENSE_CATEGORIES, jalaliMonthKey } from "@/lib";

const upsertSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().int().positive("مبلغ باید مثبت باشد").max(9_999_999_999),
  month: z.string().regex(/^\d{4}-\d{2}$/, "ماه نامعتبر است").optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const month = req.nextUrl.searchParams.get("month") ?? jalaliMonthKey();

    const [budgets, expenses] = await Promise.all([
      prisma.budget.findMany({
        where: { householdId, month },
        select: { id: true, category: true, amount: true, month: true },
      }),
      prisma.expense.findMany({
        where: { householdId },
        select: { category: true, amount: true, date: true },
      }),
    ]);

    // compute spend for the Jalali month window (approx via month key on date)
    const { startOfDayUtcFromIso, endOfDayUtcFromIso, jalaliPartsInTz, pad2 } = await import("@/lib");
    const [jy, jm] = month.split("-").map(Number);
    const startIso = `${jy}-${pad2(jm)}-01`;
    const lastDay = await import("@/lib").then((m) => m.jMonthLen(jy, jm));
    const endIso = `${jy}-${pad2(jm)}-${pad2(lastDay)}`;

    const spentByCategory = new Map<string, number>();
    for (const e of expenses) {
      const p = jalaliPartsInTz(e.date, "Asia/Tehran");
      if (p.jy !== jy || p.jm !== jm) continue;
      spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amount);
    }

    const items = budgets.map((b) => {
      const spent = spentByCategory.get(b.category) ?? 0;
      const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      return { ...b, spent, remaining: b.amount - spent, pct, over: spent > b.amount, nearLimit: pct >= 80 && spent <= b.amount };
    });

    return ok({ month, items, categories: EXPENSE_CATEGORIES });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[budgets]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = { ...parsed.data, month: parsed.data.month ?? jalaliMonthKey() };

    const budget = await prisma.budget.upsert({
      where: { householdId_category_month: { householdId, category: d.category, month: d.month } },
      create: { householdId, category: d.category, amount: d.amount, month: d.month },
      update: { amount: d.amount },
      select: { id: true, category: true, amount: true, month: true },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "BUDGET_ADDED",
      summary: `${user.fullName} بودجه دسته‌ای را تعیین کرد`,
      entityId: budget.id,
      notifyPartner: false,
    });

    return ok(budget, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[budget put]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
