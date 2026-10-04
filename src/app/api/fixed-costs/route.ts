import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { jalaliMonthKey } from "@/lib";

// Fixed monthly costs (هزینه‌های ثابت) — اجاره، قبوض به تفکیک، قسط، کمک ماهانه.
// The TEMPLATE is permanent; each Jalali month you just tick payments off.
// Ticking also logs a real expense (BILLS category) so stats stay in sync.

export const FIXED_KINDS = ["RENT", "BILL", "INSTALLMENT", "SUPPORT"] as const;

const upsertSchema = z.object({
  title: z.string().trim().min(1, "عنوان را وارد کنید").max(100),
  amount: z.number().int().positive("مبلغ باید بیشتر از صفر باشد").max(2_000_000_000),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  kind: z.enum(FIXED_KINDS).default("BILL"),
});

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    let month = sp.get("month");
    if (!month || !MONTH_KEY.test(month)) month = jalaliMonthKey();

    const costs = await prisma.fixedCost.findMany({
      where: { householdId, active: true },
      orderBy: [{ kind: "asc" }, { dayOfMonth: "asc" }, { createdAt: "asc" }],
      include: {
        payments: {
          where: { monthKey: month },
          include: { paidBy: { select: { id: true, fullName: true } } },
        },
      },
    });

    const total = costs.reduce((s, c) => s + c.amount, 0);
    const paid = costs.reduce((s, c) => s + (c.payments.length ? c.amount : 0), 0);

    return ok({
      monthKey: month,
      items: costs.map((c) => ({
        id: c.id,
        title: c.title,
        amount: c.amount,
        dayOfMonth: c.dayOfMonth,
        kind: c.kind,
        paid: c.payments.length > 0,
        paidBy: c.payments[0]?.paidBy?.fullName ?? null,
        paidAt: c.payments[0]?.paidAt ?? null,
      })),
      total,
      paid,
      remaining: total - paid,
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[fixed-costs list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const dup = await prisma.fixedCost.findFirst({ where: { householdId, active: true, title: d.title } });
    if (dup) return fail(409, "هزینه ثابتی با این عنوان قبلاً اضافه شده است", "DUPLICATE");

    const created = await prisma.fixedCost.create({
      data: {
        householdId,
        title: d.title,
        amount: d.amount,
        ...(d.dayOfMonth ? { dayOfMonth: d.dayOfMonth } : {}),
        kind: d.kind,
        createdById: user.id,
      },
    });
    return ok({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[fixed-costs create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

const patchSchema = z.object({
  action: z.enum(["pay", "unpay"]),
  month: z.string().regex(MONTH_KEY).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "شناسه لازم است", "VALIDATION");

    const cost = await prisma.fixedCost.findFirst({ where: { id, householdId, active: true } });
    if (!cost) return fail(404, "یافت نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const month = parsed.data.month && MONTH_KEY.test(parsed.data.month) ? parsed.data.month : jalaliMonthKey();

    if (parsed.data.action === "pay") {
      // mark paid + log the real expense so finance stats stay true
      await prisma.$transaction(async (tx) => {
        await tx.fixedCostPayment.upsert({
          where: { fixedCostId_monthKey: { fixedCostId: cost.id, monthKey: month } },
          create: { householdId, fixedCostId: cost.id, monthKey: month, paidById: user.id },
          update: { paidById: user.id, paidAt: new Date() },
        });
        await tx.expense.create({
          data: {
            householdId,
            title: `${cost.title} (${month})`,
            amount: cost.amount,
            category: "BILLS",
            date: new Date(),
            isShared: true,
            payerId: user.id,
            createdBy: user.id,
          },
        });
      });
      return ok({ paid: true });
    }

    // unpay: remove tick + remove the expense we logged for that month
    await prisma.$transaction(async (tx) => {
      const payment = await tx.fixedCostPayment.findUnique({
        where: { fixedCostId_monthKey: { fixedCostId: cost.id, monthKey: month } },
      });
      if (payment) {
        await tx.fixedCostPayment.delete({ where: { id: payment.id } });
        await tx.expense.deleteMany({
          where: { householdId, title: `${cost.title} (${month})`, amount: cost.amount },
        });
      }
    });
    return ok({ paid: false });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[fixed-costs patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "شناسه لازم است", "VALIDATION");
    const cost = await prisma.fixedCost.findFirst({ where: { id, householdId } });
    if (!cost) return fail(404, "یافت نشد", "NOT_FOUND");
    // soft delete: template disappears but payment history stays intact
    await prisma.fixedCost.update({ where: { id: cost.id }, data: { active: false } });
    return ok({ done: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[fixed-costs delete]", err);
    return fail(500, "خطای سرور — لطفاً تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
