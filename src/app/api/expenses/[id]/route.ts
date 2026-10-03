import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { EXPENSE_CATEGORIES, startOfDayUtcFromIso } from "@/lib";

const patchSchema = z.object({
  title: z.string().trim().min(1, "عنوان را وارد کنید").max(80).optional(),
  amount: z.number().int("مبلغ باید عدد صحیح باشد").positive("مبلغ باید مثبت باشد").max(9_999_999_999).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").optional(),
  payerId: z.string().min(1).optional(),
  isShared: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    // householdId in where → foreign rows 404 (no IDOR probing)
    const expense = await prisma.expense.findFirst({
      where: { id, householdId },
      include: { payer: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });
    if (!expense) return fail(404, "هزینه پیدا نشد", "NOT_FOUND");
    return ok(expense);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[expense get]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.expense.findFirst({ where: { id, householdId }, select: { id: true, title: true } });
    if (!existing) return fail(404, "هزینه پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.payerId && !(await isMember(householdId, d.payerId))) {
      return fail(400, "پرداخت‌کننده عضو این خانواده نیست", "INVALID_PAYER");
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.amount !== undefined ? { amount: d.amount } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.date !== undefined ? { date: startOfDayUtcFromIso(d.date) } : {}),
        ...(d.payerId !== undefined ? { payerId: d.payerId } : {}),
        ...(d.isShared !== undefined ? { isShared: d.isShared } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
      include: { payer: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "EXPENSE_UPDATED",
      summary: `${user.fullName} هزینه «${expense.title}» را ویرایش کرد`,
      entityId: expense.id,
      notifType: "EXPENSE",
      notifTitle: "ویرایش هزینه",
      notifLink: "/finance",
    });

    return ok(expense);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[expense patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.expense.findFirst({ where: { id, householdId }, select: { id: true, title: true } });
    if (!existing) return fail(404, "هزینه پیدا نشد", "NOT_FOUND");

    await prisma.expense.delete({ where: { id } });
    await logActivity({
      householdId,
      userId: user.id,
      type: "EXPENSE_DELETED",
      summary: `${user.fullName} هزینه «${existing.title}» را حذف کرد`,
      notifyPartner: true,
      notifType: "EXPENSE",
      notifTitle: "حذف هزینه",
      notifLink: "/finance",
    });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[expense delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
