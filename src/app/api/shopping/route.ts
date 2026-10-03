import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { PRIORITIES, SHOP_CATEGORIES } from "@/lib";

const itemSchema = z.object({
  title: z.string().trim().min(1, "نام کالا را وارد کنید").max(80),
  quantity: z.string().trim().max(20).default("1"),
  unit: z.string().trim().max(20).optional(),
  category: z.enum(SHOP_CATEGORIES).default("OTHER"),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  note: z.string().trim().max(300).optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const filter = sp.get("filter"); // pending | done | all
    const category = sp.get("category");
    const q = sp.get("q")?.trim();

    const where = {
      householdId,
      ...(filter === "pending" ? { completed: false } : filter === "done" ? { completed: true } : {}),
      ...(category && SHOP_CATEGORIES.includes(category as never) ? { category } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    };

    const items = await prisma.shoppingItem.findMany({
      where,
      orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
      include: {
        addedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[shopping list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.assignedToId && !(await isMember(householdId, d.assignedToId))) {
      return fail(400, "این فرد عضو خانواده شما نیست", "INVALID_ASSIGNEE");
    }

    const item = await prisma.shoppingItem.create({
      data: {
        householdId,
        title: d.title,
        quantity: d.quantity,
        unit: d.unit ?? null,
        category: d.category,
        priority: d.priority,
        note: d.note ?? null,
        addedById: user.id,
        assignedToId: d.assignedToId ?? null,
      },
      include: {
        addedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "SHOPPING_ADDED",
      summary: `${user.fullName} «${item.title}» را به لیست خرید اضافه کرد`,
      entityId: item.id,
      notifType: "SHOPPING",
      notifTitle: "آیتم جدید در لیست خرید",
      notifLink: "/shopping",
    });

    return ok(item, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[shopping create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
