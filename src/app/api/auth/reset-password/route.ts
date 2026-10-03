import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { destroyAllSessions } from "@/server/auth/session";

const schema = z.object({
  token: z.string().min(20, "لینک بازیابی نامعتبر است"),
  newPassword: z.string().min(8, "رمز جدید باید حداقل ۸ کاراکتر باشد").max(72),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    const tokenHash = createHash("sha256")
      .update(`${parsed.data.token}:${process.env.SESSION_SECRET ?? "dev"}`)
      .digest("hex");

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return fail(400, "لینک بازیابی نامعتبر یا منقضی شده است", "INVALID_TOKEN");
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    await destroyAllSessions(record.userId);

    return ok({ reset: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
