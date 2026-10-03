import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";

const patchSchema = z.object({
  name: z.string().trim().min(2, "نام خانواده باید حداقل ۲ حرف باشد").max(40).optional(),
  avatarEmoji: z.string().trim().max(8).optional(),
});

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: {
        id: true, name: true, avatarEmoji: true, createdAt: true,
        users: { select: { id: true, fullName: true, avatarEmoji: true, email: true }, orderBy: { createdAt: "asc" } },
        invitations: {
          where: { status: "PENDING" },
          select: { id: true, code: true, expiresAt: true },
          take: 1,
        },
      },
    });
    if (!household) return fail(404, "خانواده پیدا نشد", "NOT_FOUND");
    return ok(household);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[household get]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const household = await prisma.household.update({
      where: { id: householdId },
      data: parsed.data,
      select: { id: true, name: true, avatarEmoji: true },
    });
    return ok(household);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[household patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

/** Leave (and if last member, cascade-delete) the household. */
export async function DELETE() {
  try {
    const { user, householdId } = await requireHousehold();
    await prisma.user.update({ where: { id: user.id }, data: { householdId: null } });
    const remaining = await prisma.user.count({ where: { householdId } });
    if (remaining === 0) {
      await prisma.household.delete({ where: { id: householdId } });
    }
    return ok({ left: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[household delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
