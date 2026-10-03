import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { MEAL_SLOTS, startOfDayUtcFromIso } from "@/lib";

type Params = { params: Promise<{ id: string }> };

/** Push a meal's ingredients into the shared shopping list. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const meal = await prisma.mealEntry.findFirst({
      where: { id, householdId },
    });
    if (!meal) return fail(404, "برنامه غذایی پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => ({}));
    const parsed = z.object({}).safeParse(body ?? {});
    if (!parsed.success) return fail(400, "داده نامعتبر است", "VALIDATION");

    const ingredients = (meal.ingredients as Array<{ name: string; qty?: string }> | null) ?? [];
    if (ingredients.length === 0) {
      return fail(400, "برای این وعده مواد اولیه‌ای ثبت نشده است", "NO_INGREDIENTS");
    }

    // merge with existing pending items (dedupe by title)
    const existing = await prisma.shoppingItem.findMany({
      where: { householdId, completed: false },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((e) => e.title.trim()));
    const toAdd = ingredients.filter((i) => !existingTitles.has(i.name.trim()));
    if (toAdd.length === 0) {
      return ok({ added: 0, items: [], message: "همه مواد از قبل در لیست خرید هستند" });
    }

    const items = await prisma.shoppingItem.createMany({
      data: toAdd.map((i) => ({
        householdId,
        title: i.name,
        quantity: i.qty ?? "1",
        category: "GROCERY",
        addedById: user.id,
      })),
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "MEAL_TO_SHOPPING",
      summary: `${user.fullName} مواد لازم «${meal.title}» را به لیست خرید اضافه کرد`,
      entityId: meal.id,
      notifType: "SHOPPING",
      notifTitle: "مواد اولیه به لیست خرید اضافه شد",
      notifLink: "/shopping",
    });

    return ok({ added: toAdd.length }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[meal to shopping]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
