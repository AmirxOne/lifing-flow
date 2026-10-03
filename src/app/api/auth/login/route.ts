import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { SESSION_COOKIE, createSession } from "@/server/auth/session";
import { isLimited, recordFailure, clearRateLimit } from "@/server/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است"),
  password: z.string().min(1, "رمز عبور را وارد کنید"),
});

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  try {
    const key = clientKey(req);
    if (isLimited(key)) {
      return fail(429, "تلاش بیش از حد — کمی بعد دوباره امتحان کنید", "RATE_LIMITED");
    }
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(400, issue?.message ?? "داده نامعتبر است", "VALIDATION");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user?.isActive ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      recordFailure(key);
      return fail(401, "ایمیل یا رمز عبور اشتباه است", "BAD_CREDENTIALS");
    }
    clearRateLimit(key);

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
    console.error("[login]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
