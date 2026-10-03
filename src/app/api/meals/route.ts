import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { MEAL_SLOTS, startOfDayUtcFromIso, endOfDayUtcFromIso } from "@/lib";

const mealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  slot: z.enum(MEAL_SLOTS),
  title: z.string().trim().min(1, "نام غذا را وارد کنید").max(80),
  note: z.string().trim().max(300).optional(),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    qty: z.string().trim().max(20).optional(),
  })).max(40).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const where = {
      householdId,
      ...(from || to ? {
        date: {
          ...(from ? { gte: startOfDayUtcFromIso(from) } : {}),
          ...(to ? { lte: endOfDayUtcFromIso(to) } : {}),
        },
      } : {}),
    };
    const items = await prisma.mealEntry.findMany({ where, orderBy: { date: "asc" } });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[meals]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = mealSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const meal = await prisma.mealEntry.upsert({
      where: { householdId_date_slot: { householdId, date: startOfDayUtcFromIso(d.date), slot: d.slot } },
      create: {
        householdId,
        date: startOfDayUtcFromIso(d.date),
        slot: d.slot,
        title: d.title,
        note: d.note ?? null,
        ...(d.ingredients ? { ingredients: d.ingredients } : {}),
      },
      update: {
        title: d.title,
        note: d.note ?? null,
        ...(d.ingredients ? { ingredients: d.ingredients } : {}),
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "MEAL_ADDED",
      summary: `${user.fullName} برنامه غذایی «${meal.title}» را ثبت کرد`,
      entityId: meal.id,
      notifType: "ACTIVITY",
      notifTitle: "برنامه غذایی",
      notifLink: "/meals",
    });

    return ok(meal, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[meal create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
