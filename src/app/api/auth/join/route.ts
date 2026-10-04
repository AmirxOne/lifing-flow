import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { SESSION_COOKIE, createSession } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { toEnDigits } from "@/lib/fa";
import { recordFailure, isLimited } from "@/server/rate-limit";

// Partner onboarding: the ONLY way a second account ever exists.
// One shot — account creation + household join — gated entirely by the invite code.
const joinSchema = z.object({
  code: z.string().trim().min(4, "کد دعوت را وارد کنید").max(16)
    .transform((v) => toEnDigits(v).toUpperCase()),
  fullName: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد").max(60, "نام طولانی است"),
  email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است"),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد").max(72),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limitKey = `join:${ip}`;
  try {
    if (isLimited(limitKey)) {
      return fail(429, "تلاش‌های زیادی ناموفق بوده — کمی بعد دوباره امتحان کنید", "RATE_LIMITED");
    }

    const body = await req.json().catch(() => null);
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    }
    const { code, fullName, email, password } = parsed.data;

    // validate the invitation BEFORE creating anything
    const invitation = await prisma.invitation.findUnique({
      where: { code },
      include: { household: { select: { id: true, name: true } } },
    });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      recordFailure(limitKey);
      return fail(404, "کد دعوت نامعتبر یا منقضی شده است", "INVALID_INVITE");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(409, "این ایمیل قبلاً ثبت شده است — از ورود استفاده کنید", "EMAIL_TAKEN");
    }

    if (invitation.inviteeEmail && invitation.inviteeEmail !== email) {
      recordFailure(limitKey);
      return fail(403, "این دعوت‌نامه برای ایمیل دیگری صادر شده است", "INVITE_EMAIL_MISMATCH");
    }

    const count = await prisma.user.count({ where: { householdId: invitation.householdId } });
    if (count >= 2) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      return fail(409, "این خانواده تکمیل است", "HOUSEHOLD_FULL");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction([
      prisma.user.create({
        data: { fullName, email, passwordHash, householdId: invitation.householdId, onboardingDone: true },
        select: { id: true, fullName: true, email: true },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      }),
    ]).then(([u]) => u);

    await logActivity({
      householdId: invitation.householdId,
      userId: user.id,
      type: "PARTNER_JOINED",
      summary: `${user.fullName} به خانواده «${invitation.household.name}» پیوست`,
      notifType: "INVITE",
      notifTitle: `${user.fullName} پیوست`,
      notifBody: `همسرتان به خانواده «${invitation.household.name}» ملحق شد`,
    });

    const token = await createSession(user.id);
    const res = ok({ id: user.id, fullName: user.fullName, household: invitation.household.name });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    console.error("[join-register]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
