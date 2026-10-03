import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/session";
import { isLimited, recordFailure, clearRateLimit } from "@/server/rate-limit";
const registerSchema = z.object({
  fullName: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد").max(60, "نام طولانی است"),
  email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است"),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد").max(72),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(400, issue?.message ?? "داده نامعتبر است", "VALIDATION");
    }
    const { fullName, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(409, "این ایمیل قبلاً ثبت شده است", "EMAIL_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { fullName, email, passwordHash },
      select: { id: true, fullName: true, email: true },
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
    console.error("[register]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
