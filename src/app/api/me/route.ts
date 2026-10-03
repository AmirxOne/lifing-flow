import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, HttpError, destroyAllSessions, createSession, SESSION_COOKIE } from "@/server/auth/session";

const patchSchema = z.object({
  fullName: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد").max(60).optional(),
  avatarEmoji: z.string().trim().max(8).nullable().optional(),
});

const passwordSchema = z.object({
  oldPassword: z.string().min(1, "رمز فعلی را وارد کنید"),
  newPassword: z.string().min(8, "رمز جدید باید حداقل ۸ کاراکتر باشد").max(72),
});

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const user = await prisma.user.update({
      where: { id: auth.id },
      data: {
        ...(parsed.data.fullName !== undefined ? { fullName: parsed.data.fullName } : {}),
        ...(parsed.data.avatarEmoji !== undefined ? { avatarEmoji: parsed.data.avatarEmoji } : {}),
      },
      select: { id: true, fullName: true, avatarEmoji: true },
    });
    return ok(user);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[me patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const user = await prisma.user.findUnique({ where: { id: auth.id } });
    if (!user || !(await bcrypt.compare(parsed.data.oldPassword, user.passwordHash))) {
      return fail(401, "رمز فعلی اشتباه است", "BAD_CREDENTIALS");
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({ where: { id: auth.id }, data: { passwordHash } });

    // rotate sessions: drop others, issue fresh cookie
    await destroyAllSessions(auth.id);
    const token = await createSession(auth.id);
    const res = ok({ changed: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[password change]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
