import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { IMPORTANT_KINDS, startOfDayUtcFromIso } from "@/lib";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(IMPORTANT_KINDS).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").optional(),
  repeatsYearly: z.boolean().optional(),
  reminderOffsets: z.array(z.number().int().min(0).max(60)).max(5).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.importantDate.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "مناسبت پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const item = await prisma.importantDate.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.kind !== undefined ? { kind: d.kind } : {}),
        ...(d.date !== undefined ? { date: startOfDayUtcFromIso(d.date) } : {}),
        ...(d.repeatsYearly !== undefined ? { repeatsYearly: d.repeatsYearly } : {}),
        ...(d.reminderOffsets !== undefined ? { reminderOffsets: d.reminderOffsets } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
    });
    return ok(item);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[important date patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.importantDate.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "مناسبت پیدا نشد", "NOT_FOUND");
    await prisma.importantDate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[important date delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
