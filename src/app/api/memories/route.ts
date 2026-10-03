import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { startOfDayUtcFromIso } from "@/lib";

const memorySchema = z.object({
  title: z.string().trim().min(1, "عنوان خاطره را وارد کنید").max(100),
  description: z.string().trim().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
});

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const items = await prisma.memory.findMany({
      where: { householdId },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[memories]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = memorySchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const memory = await prisma.memory.create({
      data: {
        householdId,
        title: d.title,
        description: d.description ?? null,
        date: startOfDayUtcFromIso(d.date),
        ...(d.tags ? { tags: d.tags } : {}),
        createdById: user.id,
      },
      include: { createdBy: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "MEMORY_ADDED",
      summary: `${user.fullName} خاطره «${memory.title}» را ثبت کرد`,
      entityId: memory.id,
      notifType: "ACTIVITY",
      notifTitle: "خاطره جدید",
      notifLink: "/memories",
    });

    return ok(memory, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[memory create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
