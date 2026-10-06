import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { EVENT_KINDS, REMINDERS, startOfDayUtcFromIso } from "@/lib";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  kind: z.enum(EVENT_KINDS).or(z.string().trim().min(1, "نوع را وارد کنید").max(30, "نوع حداکثر ۳۰ کاراکتر است")).optional(),
  reminder: z.enum(REMINDERS).nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.eventModel.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "رویداد پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.startTime && d.endTime && d.endTime <= d.startTime) {
      return fail(400, "ساعت پایان باید بعد از ساعت شروع باشد", "INVALID_TIME");
    }

    const event = await prisma.eventModel.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.date !== undefined ? { date: startOfDayUtcFromIso(d.date) } : {}),
        ...(d.startTime !== undefined ? { startTime: d.startTime } : {}),
        ...(d.endTime !== undefined ? { endTime: d.endTime } : {}),
        ...(d.location !== undefined ? { location: d.location } : {}),
        ...(d.kind !== undefined ? { kind: d.kind } : {}),
        ...(d.reminder !== undefined ? { reminder: d.reminder ?? "NONE" } : {}),
        ...(d.recurrence !== undefined ? { recurrence: d.recurrence } : {}),
      },
    });
    return ok(event);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[event patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.eventModel.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "رویداد پیدا نشد", "NOT_FOUND");
    await prisma.eventModel.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[event delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
