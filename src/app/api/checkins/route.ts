import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { startOfDayUtcFromIso, endOfDayUtcFromIso } from "@/lib";

const checkinSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  happy: z.string().trim().max(500).optional(),
  bothered: z.string().trim().max(500).optional(),
  need: z.string().trim().max(500).optional(),
  visibility: z.literal("SHARED").optional(), // private mode removed — always shared
});

export async function GET(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");

    const where = {
      householdId,
      ...(from || to ? {
        date: {
          ...(from ? { gte: startOfDayUtcFromIso(from) } : {}),
          ...(to ? { lte: endOfDayUtcFromIso(to) } : {}),
        },
      } : {}),
      // PRIVACY: partner sees only SHARED rows
      // all entries shared by design (no private mode)
    };

    const items = await prisma.checkIn.findMany({
      where,
      orderBy: { date: "desc" },
      include: { user: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[checkins]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = checkinSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;
    if (!d.happy && !d.bothered && !d.need) {
      return fail(400, "حداقل یکی از فیلدها را پر کنید", "EMPTY_CHECKIN");
    }

    const checkin = await prisma.checkIn.upsert({
      where: { userId_date: { userId: user.id, date: startOfDayUtcFromIso(d.date) } },
      create: {
        householdId,
        userId: user.id,
        date: startOfDayUtcFromIso(d.date),
        happy: d.happy ?? null,
        bothered: d.bothered ?? null,
        need: d.need ?? null,
        visibility: d.visibility,
      },
      update: {
        happy: d.happy ?? null,
        bothered: d.bothered ?? null,
        need: d.need ?? null,
        visibility: d.visibility,
      },
    });

    if (d.visibility === "SHARED") {
      await logActivity({
        householdId,
        userId: user.id,
        type: "CHECKIN_ADDED",
        summary: `${user.fullName} چک‌این روزانه را ثبت کرد`,
        entityId: checkin.id,
        notifType: "ACTIVITY",
        notifTitle: "چک‌این روزانه",
        notifLink: "/relationship",
      });
    }

    return ok(checkin, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[checkin create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
