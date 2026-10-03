import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail, parsePage } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { EXPENSE_CATEGORIES, startOfDayUtcFromIso, endOfDayUtcFromIso } from "@/lib";

const expenseSchema = z.object({
  title: z.string().trim().min(1, "عنوان را وارد کنید").max(80, "عنوان طولانی است"),
  amount: z.number().int("مبلغ باید عدد صحیح باشد").positive("مبلغ باید مثبت باشد").max(9_999_999_999, "مبلغ بیش از حد بزرگ است"),
  category: z.enum(EXPENSE_CATEGORIES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  payerId: z.string().min(1),
  isShared: z.boolean().default(true),
  note: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const page = parsePage(sp.get("page"));
    const pageSize = 20;

    const from = sp.get("from");
    const to = sp.get("to");
    const category = sp.get("category");
    const payerId = sp.get("payer");
    const q = sp.get("q")?.trim();

    const where = {
      householdId,
      ...(category && EXPENSE_CATEGORIES.includes(category as never) ? { category } : {}),
      ...(payerId ? { payerId } : {}),
      ...(from || to ? {
        date: {
          ...(from ? { gte: startOfDayUtcFromIso(from) } : {}),
          ...(to ? { lte: endOfDayUtcFromIso(to) } : {}),
        },
      } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    };

    const [items, total, sum] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { payer: { select: { id: true, fullName: true, avatarEmoji: true } } },
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return ok({ items, total, page, pageSize, sum: sum._sum.amount ?? 0 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[expenses list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    // payer must be a member of THIS household
    if (!(await isMember(householdId, d.payerId))) {
      return fail(400, "پرداخت‌کننده عضو این خانواده نیست", "INVALID_PAYER");
    }

    const expense = await prisma.expense.create({
      data: {
        householdId,
        title: d.title,
        amount: d.amount,
        category: d.category,
        date: startOfDayUtcFromIso(d.date),
        payerId: d.payerId,
        isShared: d.isShared,
        note: d.note ?? null,
        createdBy: user.id,
      },
      include: { payer: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "EXPENSE_ADDED",
      summary: `${user.fullName} هزینه «${expense.title}» را ثبت کرد`,
      entityId: expense.id,
      notifType: "EXPENSE",
      notifTitle: "هزینه جدید",
      notifBody: `${user.fullName} هزینه «${expense.title}» را ثبت کرد`,
      notifLink: "/finance",
    });

    return ok(expense, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[expense create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
