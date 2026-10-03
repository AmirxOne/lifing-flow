import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";

const createSchema = z.object({
  name: z.string().trim().min(2, "نام خانواده باید حداقل ۲ حرف باشد").max(40),
  avatarEmoji: z.string().trim().max(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    }

    if (auth.householdId) {
      return fail(409, "شما قبلاً عضو یک خانواده هستید", "ALREADY_IN_HOUSEHOLD");
    }

    const household = await prisma.household.create({
      data: {
        name: parsed.data.name,
        avatarEmoji: parsed.data.avatarEmoji ?? "🏠",
        users: { connect: { id: auth.id } },
      },
      select: { id: true, name: true, avatarEmoji: true },
    });
    await prisma.user.update({
      where: { id: auth.id },
      data: { onboardingDone: true },
    });

    await logActivity({
      householdId: household.id,
      userId: auth.id,
      type: "HOUSEHOLD_CREATED",
      summary: `خانواده «${household.name}» ساخته شد`,
      notifyPartner: false,
    });

    return ok(household, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[household create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
