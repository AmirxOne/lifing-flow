import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { PRIORITIES, SHOP_CATEGORIES } from "@/lib";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  quantity: z.string().trim().max(20).optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  category: z.enum(SHOP_CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  completed: z.boolean().optional(),
});

async function scoped(id: string, householdId: string) {
  return prisma.shoppingItem.findFirst({ where: { id, householdId }, select: { id: true, title: true, completed: true } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await scoped(id, householdId);
    if (!existing) return fail(404, "آیتم پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.assignedToId && !(await isMember(householdId, d.assignedToId))) {
      return fail(400, "این فرد عضو خانواده شما نیست", "INVALID_ASSIGNEE");
    }

    const item = await prisma.shoppingItem.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.quantity !== undefined ? { quantity: d.quantity } : {}),
        ...(d.unit !== undefined ? { unit: d.unit } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
        ...(d.assignedToId !== undefined ? { assignedToId: d.assignedToId } : {}),
        ...(d.completed !== undefined ? { completed: d.completed, completedAt: d.completed ? new Date() : null } : {}),
      },
      include: {
        addedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });

    if (d.completed === true && !existing.completed) {
      await logActivity({
        householdId,
        userId: user.id,
        type: "SHOPPING_DONE",
        summary: `${user.fullName} «${item.title}» را خرید`,
        entityId: item.id,
        notifType: "SHOPPING",
        notifTitle: "خرید انجام شد",
        notifLink: "/shopping",
      });
    }

    return ok(item);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[shopping patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await scoped(id, householdId);
    if (!existing) return fail(404, "آیتم پیدا نشد", "NOT_FOUND");
    await prisma.shoppingItem.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[shopping delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
