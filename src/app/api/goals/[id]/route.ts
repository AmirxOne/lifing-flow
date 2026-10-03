import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  targetAmount: z.number().int().positive().max(9_999_999_999).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.goal.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "هدف پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.targetAmount !== undefined ? { targetAmount: d.targetAmount } : {}),
        ...(d.deadline !== undefined ? { deadline: d.deadline ? new Date(`${d.deadline}T00:00:00+03:30`) : null } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
    });
    return ok(goal);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[goal patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.goal.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "هدف پیدا نشد", "NOT_FOUND");
    await prisma.goal.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[goal delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
