import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { SESSION_COOKIE, createSession } from "@/server/auth/session";

// Private two-person app: NO public registration.
// Account #1 may only be created while the database has zero users (first-run /setup).
// Everyone after the first person joins exclusively via invite code (/api/auth/join).
const firstUserSchema = z.object({
  fullName: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد").max(60, "نام طولانی است"),
  email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است"),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد").max(72),
  householdName: z.string().trim().min(2, "نام خانواده باید حداقل ۲ حرف باشد").max(40),
  householdEmoji: z.string().trim().max(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return fail(403, "ثبت‌نام عمومی بسته است — ورود همسر فقط با کد دعوت امکان‌پذیر است", "REGISTRATION_CLOSED");
    }

    const body = await req.json().catch(() => null);
    const parsed = firstUserSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    }
    const { fullName, email, password, householdName, householdEmoji } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(409, "این ایمیل قبلاً ثبت شده است", "EMAIL_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      // re-check inside the transaction to close the race window
      const count = await tx.user.count();
      if (count > 0) throw Object.assign(new Error("REGISTRATION_CLOSED"), { code: "REGISTRATION_CLOSED" });
      const household = await tx.household.create({
        data: { name: householdName, avatarEmoji: householdEmoji ?? "🏠" },
      });
      return tx.user.create({
        data: { fullName, email, passwordHash, householdId: household.id, onboardingDone: true },
        select: { id: true, fullName: true, email: true },
      });
    });

    const token = await createSession(user.id);
    const res = ok({ id: user.id, fullName: user.fullName, email: user.email });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "REGISTRATION_CLOSED") {
      return fail(403, "ثبت‌نام عمومی بسته است — ورود همسر فقط با کد دعوت امکان‌پذیر است", "REGISTRATION_CLOSED");
    }
    console.error("[register]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
