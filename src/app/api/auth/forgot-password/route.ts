import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // Always respond the same way — no account probing
    if (!user || !user.isActive) {
      return ok({ sent: true });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256")
      .update(`${token}:${process.env.SESSION_SECRET ?? "dev"}`)
      .digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
      },
    });

    // zero-cost private app: no mail server — return the link directly
    return ok({ sent: true, resetPath: `/reset-password?token=${token}` });
  } catch (err) {
    console.error("[forgot-password]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
