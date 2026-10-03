import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, requireHousehold, HttpError } from "@/server/auth/session";

function newInviteCode(): string {
  return randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();

    const count = await prisma.user.count({ where: { householdId } });
    if (count >= 2) {
      return fail(409, "خانواده تکمیل است — دو نفر بیشتر جا نمی‌شوند", "HOUSEHOLD_FULL");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = z.object({
      inviteeEmail: z.string().trim().toLowerCase().email("ایمیل نامعتبر است").optional(),
    }).safeParse(body ?? {});
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");

    // invalidate previous pending invitations for this household
    await prisma.invitation.updateMany({
      where: { householdId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });

    const code = newInviteCode();
    const invitation = await prisma.invitation.create({
      data: {
        code,
        householdId,
        createdById: user.id,
        inviteeEmail: parsed.data.inviteeEmail ?? null,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      },
      select: { id: true, code: true, expiresAt: true, inviteeEmail: true },
    });

    return ok(invitation, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[invite create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
