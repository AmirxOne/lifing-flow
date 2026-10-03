import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { IMPORTANT_KINDS, startOfDayUtcFromIso } from "@/lib";

const dateSchema = z.object({
  title: z.string().trim().min(1, "عنوان مناسبت را وارد کنید").max(80),
  kind: z.enum(IMPORTANT_KINDS).default("CUSTOM"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  repeatsYearly: z.boolean().default(true),
  reminderOffsets: z.array(z.number().int().min(0).max(60)).max(5).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const items = await prisma.importantDate.findMany({
      where: { householdId },
      orderBy: { date: "asc" },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[important dates]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = dateSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const item = await prisma.importantDate.create({
      data: {
        householdId,
        title: d.title,
        kind: d.kind,
        date: startOfDayUtcFromIso(d.date),
        repeatsYearly: d.repeatsYearly,
        reminderOffsets: d.reminderOffsets ?? [7, 3, 1],
        note: d.note ?? null,
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "IMPORTANT_DATE_ADDED",
      summary: `${user.fullName} مناسبت «${item.title}» را ثبت کرد`,
      entityId: item.id,
      notifType: "IMPORTANT_DATE",
      notifTitle: "مناسبت جدید",
      notifLink: "/calendar",
    });

    return ok(item, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[important date create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
