import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { toEnDigits } from "@/lib/fa";

const joinSchema = z.object({
  code: z.string().trim().min(4, "کد دعوت را وارد کنید").max(16)
    .transform((v) => toEnDigits(v).toUpperCase()),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    if (auth.householdId) {
      return fail(409, "شما قبلاً عضو یک خانواده هستید", "ALREADY_IN_HOUSEHOLD");
    }

    const invitation = await prisma.invitation.findUnique({
      where: { code: parsed.data.code },
      include: { household: { select: { id: true, name: true } } },
    });

    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      return fail(404, "کد دعوت نامعتبر یا منقضی شده است", "INVALID_INVITE");
    }

    const count = await prisma.user.count({ where: { householdId: invitation.householdId } });
    if (count >= 2) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      return fail(409, "این خانواده تکمیل است", "HOUSEHOLD_FULL");
    }

    if (invitation.inviteeEmail && invitation.inviteeEmail !== auth.email) {
      return fail(403, "این دعوت‌نامه برای ایمیل دیگری صادر شده است", "INVITE_EMAIL_MISMATCH");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: auth.id },
        data: { householdId: invitation.householdId, onboardingDone: true },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      }),
    ]);

    await logActivity({
      householdId: invitation.householdId,
      userId: auth.id,
      type: "PARTNER_JOINED",
      summary: `${auth.fullName} به خانواده «${invitation.household.name}» پیوست`,
      notifType: "INVITE",
      notifTitle: `${auth.fullName} پیوست`,
      notifBody: `همسرتان به خانواده «${invitation.household.name}» ملحق شد`,
    });

    return ok({ householdId: invitation.householdId, name: invitation.household.name });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[join]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
