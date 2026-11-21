import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { EVENT_KINDS, REMINDERS, startOfDayUtcFromIso, endOfDayUtcFromIso, isoDateInTz, expandRecurringDates } from "@/lib";

const eventSchema = z.object({
  title: z.string().trim().min(1, "عنوان رویداد را وارد کنید").max(100),
  description: z.string().trim().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "ساعت نامعتبر است").optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "ساعت نامعتبر است").optional(),
  location: z.string().trim().max(120).optional(),
  // known kinds OR any custom kind the couple invents (stored as a free string)
  kind: z.enum(EVENT_KINDS).or(z.string().trim().min(1, "نوع را وارد کنید").max(30, "نوع حداکثر ۳۰ کاراکتر است")).default("SHARED"),
  reminder: z.enum(REMINDERS).optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");

    const fromIso = from ?? null;
    const toIso = to ?? null;

    // Base rows: events whose own date falls in the window...
    const inWindow = await prisma.eventModel.findMany({
      where: {
        householdId,
        ...(fromIso || toIso ? {
          date: {
            ...(fromIso ? { gte: startOfDayUtcFromIso(fromIso) } : {}),
            ...(toIso ? { lte: endOfDayUtcFromIso(toIso) } : {}),
          },
        } : {}),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // ...PLUS recurring events that started BEFORE the window — they still
    // occur inside it. Cap the look-back so a DAILY event from years ago can't
    // drag the whole table into memory (400 occurrences ≈ >1y of daily events).
    let recurringRows: typeof inWindow = [];
    if (fromIso) {
      const lookbackMs = 400 * 86_400_000; // ~13 months
      recurringRows = await prisma.eventModel.findMany({
        where: {
          householdId,
          recurrence: { in: ["DAILY", "WEEKLY", "MONTHLY"] },
          date: { lt: startOfDayUtcFromIso(fromIso), gte: new Date(startOfDayUtcFromIso(fromIso).getTime() - lookbackMs) },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });
    }

    // Merge + expand: each recurring row becomes one item per occurrence date.
    // `date` stays the original Date column; `dateIso` is the ISO string of the
    // occurrence this item represents (original date when non-recurring).
    const items: Array<Omit<typeof inWindow[number], "date"> & { date: Date; dateIso: string }> = [];
    for (const e of [...inWindow, ...recurringRows]) {
      const startIso = isoDateInTz(e.date);
      if (e.recurrence !== "NONE") {
        const occurrences = expandRecurringDates(startIso, e.recurrence, fromIso ?? startIso, toIso ?? startIso);
        for (const occ of occurrences) {
          items.push({ ...e, dateIso: occ });
        }
      } else {
        items.push({ ...e, dateIso: startIso });
      }
    }
    items.sort((a, b) => a.dateIso === b.dateIso
      ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
      : a.dateIso.localeCompare(b.dateIso));

    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[events list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.startTime && d.endTime && d.endTime <= d.startTime) {
      return fail(400, "ساعت پایان باید بعد از ساعت شروع باشد", "INVALID_TIME");
    }

    const event = await prisma.eventModel.create({
      data: {
        householdId,
        title: d.title,
        description: d.description ?? null,
        date: startOfDayUtcFromIso(d.date),
        startTime: d.startTime ?? null,
        endTime: d.endTime ?? null,
        location: d.location ?? null,
        kind: d.kind,
        reminder: d.reminder ?? "NONE",
        recurrence: d.recurrence,
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "EVENT_ADDED",
      summary: `${user.fullName} رویداد «${event.title}» را ثبت کرد`,
      entityId: event.id,
      notifType: "EVENT",
      notifTitle: "رویداد جدید",
      notifLink: "/calendar",
    });

    return ok(event, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[event create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
