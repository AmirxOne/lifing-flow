import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { startOfDayUtcFromIso } from "@/lib";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").optional(),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.memory.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "خاطره پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const memory = await prisma.memory.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.date !== undefined ? { date: startOfDayUtcFromIso(d.date) } : {}),
        ...(d.tags !== undefined && d.tags ? { tags: d.tags } : {}),
      },
      include: { createdBy: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });
    return ok(memory);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[memory patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.memory.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "خاطره پیدا نشد", "NOT_FOUND");
    await prisma.memory.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[memory delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
