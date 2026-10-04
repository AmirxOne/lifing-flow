import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { MOODS, startOfDayUtcFromIso, endOfDayUtcFromIso } from "@/lib";

const moodSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  mood: z.enum(MOODS),
  note: z.string().trim().max(500).optional(),
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
      // PRIVACY: partner sees only SHARED rows; own rows always visible
      // all entries shared by design (no private mode)
    };

    const items = await prisma.mood.findMany({
      where,
      orderBy: { date: "desc" },
      include: { user: { select: { id: true, fullName: true, avatarEmoji: true } } },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[moods]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = moodSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const mood = await prisma.mood.upsert({
      where: { userId_date: { userId: user.id, date: startOfDayUtcFromIso(d.date) } },
      create: {
        householdId,
        userId: user.id,
        date: startOfDayUtcFromIso(d.date),
        mood: d.mood,
        note: d.note ?? null,
        visibility: d.visibility,
      },
      update: {
        mood: d.mood,
        note: d.note ?? null,
        visibility: d.visibility,
      },
    });

    if (d.visibility === "SHARED") {
      await logActivity({
        householdId,
        userId: user.id,
        type: "MOOD_ADDED",
        summary: `${user.fullName} حال‌وهوای امروزش را ثبت کرد`,
        entityId: mood.id,
        notifType: "ACTIVITY",
        notifTitle: "حال‌وهوای همسرتان",
        notifLink: "/relationship",
      });
    } else {
      // private — no activity, no notification
      await logActivity({
        householdId,
        userId: user.id,
        type: "MOOD_ADDED",
        summary: `${user.fullName} حال‌وهوای امروزش را ثبت کرد`,
        entityId: mood.id,
        notifyPartner: false,
      });
    }

    return ok(mood, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[mood create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
