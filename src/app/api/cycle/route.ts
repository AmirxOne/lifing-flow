import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { startOfDayUtcFromIso } from "@/lib";

// Menstrual cycle tracking — shared by design (both partners see everything).
// Predictions: average of the last 6 periods — cycle length = gap between
// consecutive starts; period length = average recorded duration.

const periodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ شروع نامعتبر است"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ پایان نامعتبر است").nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

const DAY = 86_400_000;

function toUtc(iso: string | Date): number {
  return (typeof iso === "string" ? startOfDayUtcFromIso(iso) : iso).getTime();
}

function todayUtc(): number {
  // Tehran local date → its UTC midnight instant
  const now = new Date();
  const tehranDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(now);
  return startOfDayUtcFromIso(tehranDate).getTime();
}

export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const periods = await prisma.cyclePeriod.findMany({
      where: { householdId },
      orderBy: { start: "desc" },
      take: 24,
    });

    const sorted = [...periods].sort((a, b) => toUtc(a.start) - toUtc(b.start));
    const starts = sorted.map((p) => toUtc(p.start));

    // average cycle length (gap between starts) — default 28d
    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) { const g = (starts[i] - starts[i - 1]) / DAY; if (g >= 15 && g <= 60) gaps.push(g); }
    const cycleLen = gaps.length
      ? Math.round((gaps.slice(-6).reduce((s, g) => s + g, 0) / Math.min(gaps.length, 6)))
      : 28;

    // average period length from closed periods — default 5d
    const lens = sorted.filter((p) => p.end).map((p) => (toUtc(p.end!) - toUtc(p.start)) / DAY + 1).filter((l) => l >= 1 && l <= 14);
    const periodLen = lens.length
      ? Math.round(lens.slice(-6).reduce((s, l) => s + l, 0) / Math.min(lens.length, 6))
      : 5;

    const today = todayUtc();
    const lastStart = starts.length ? starts[starts.length - 1] : null;

    let nextStart: string | null = null;
    let daysUntilNext: number | null = null;
    let phase: "PERIOD" | "FOLLICULAR" | "OVULATION_WINDOW" | "LUTEAL" | "UNKNOWN" = "UNKNOWN";
    let dayOfCycle: number | null = null;

    if (lastStart !== null) {
      dayOfCycle = Math.floor((today - lastStart) / DAY) + 1;
      nextStart = new Date(lastStart + cycleLen * DAY).toISOString().slice(0, 10);
      daysUntilNext = Math.round((toUtc(nextStart) - today) / DAY);

      const d = (today - lastStart) / DAY; // 0-based day within cycle
      if (d < periodLen) phase = "PERIOD";
      else if (d >= cycleLen - 14 - 2 && d <= cycleLen - 14 + 2) phase = "OVULATION_WINDOW";
      else if (d > cycleLen - 14 + 2) phase = "LUTEAL";
      else phase = "FOLLICULAR";
    }

    // forecasts: next up-to-3 predicted starts (covers following months)
    const forecasts: string[] = [];
    // PMS window: the few days right BEFORE each predicted start
    const PMS_DAYS = 4;
    const pmsDays: string[] = [];
    if (lastStart !== null) {
      for (let n = 1; n <= 3; n++) {
        const fMs = lastStart + cycleLen * n * DAY;
        const f = new Date(fMs).toISOString().slice(0, 10);
        if (toUtc(f) >= today) forecasts.push(f);
        for (let k = PMS_DAYS; k >= 1; k--) {
          const d = new Date(fMs - k * DAY).toISOString().slice(0, 10);
          if (toUtc(d) >= today) pmsDays.push(d);
        }
      }
    }

    // variance: latest closed period vs its prediction (prev start + avg cycle)
    const closedPeriods = sorted.filter((p) => p.end);
    let lastVariance: { daysLate: number; lengthDiff: number } | null = null;
    if (closedPeriods.length >= 2) {
      const last = closedPeriods[closedPeriods.length - 1];
      const prev = closedPeriods[closedPeriods.length - 2];
      const predictedStart = toUtc(prev.start) + cycleLen * DAY;
      const daysLate = Math.round((toUtc(last.start) - predictedStart) / DAY);
      const actualLen = (toUtc(last.end!) - toUtc(last.start)) / DAY + 1;
      lastVariance = { daysLate, lengthDiff: Math.round(actualLen - periodLen) };
    }

    // small history report rows
    const report = closedPeriods.map((p, i) => {
      const prev = closedPeriods[i - 1];
      const len = (toUtc(p.end!) - toUtc(p.start)) / DAY + 1;
      return {
        id: p.id,
        start: p.start.toISOString().slice(0, 10),
        end: p.end!.toISOString().slice(0, 10),
        len: Math.round(len),
        gap: prev ? Math.round((toUtc(p.start) - toUtc(prev.start)) / DAY) : null,
        daysLate: prev ? Math.round((toUtc(p.start) - (toUtc(prev.start) + cycleLen * DAY)) / DAY) : null,
      };
    });

    return ok({
      forecasts,
      pmsDays,
      lastVariance,
      report,
      periods: periods.map((p) => ({
        id: p.id,
        start: p.start.toISOString().slice(0, 10),
        end: p.end ? p.end.toISOString().slice(0, 10) : null,
        note: p.note,
      })),
      stats: { cycleLen, periodLen },
      prediction: { nextStart, daysUntilNext, phase, dayOfCycle },
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[cycle list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = periodSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.end && toUtc(d.end) < toUtc(d.start)) {
      return fail(400, "تاریخ پایان نمی‌تواند قبل از شروع باشد", "BAD_RANGE");
    }

    // a period can only be logged once it has STARTED — no future dates.
    // (future predictions are computed forecasts, never records)
    if (toUtc(d.start) > todayUtc()) {
      return fail(400, "نمی‌توان دوره‌ای با تاریخ آینده ثبت کرد — پیش‌بینی‌ها خودکار محاسبه می‌شوند", "FUTURE_DATE");
    }

    // one open period at a time — close any ongoing one first
    // (never before its own start; guard against out-of-order logging)
    const newStartMs = startOfDayUtcFromIso(d.start).getTime();
    const openOnes = await prisma.cyclePeriod.findMany({ where: { householdId, end: null } });
    for (const open of openOnes) {
      const closeMs = Math.min(open.start.getTime() + DAY - 1, newStartMs - DAY);
      const safeCloseMs = Math.max(closeMs, open.start.getTime());
      await prisma.cyclePeriod.update({ where: { id: open.id }, data: { end: new Date(safeCloseMs) } });
    }

    const created = await prisma.cyclePeriod.create({
      data: {
        householdId,
        start: startOfDayUtcFromIso(d.start),
        ...(d.end ? { end: startOfDayUtcFromIso(d.end) } : {}),
        ...(d.note ? { note: d.note } : {}),
      },
    });
    return ok({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[cycle create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = z.object({
      id: z.string().cuid(),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    }).safeParse(body);
    if (!parsed.success) return fail(400, "داده نامعتبر است", "VALIDATION");

    const existing = await prisma.cyclePeriod.findFirst({ where: { id: parsed.data.id, householdId } });
    if (!existing) return fail(404, "یافت نشد", "NOT_FOUND");
    if (parsed.data.end && toUtc(parsed.data.end) < toUtc(existing.start.toISOString().slice(0, 10))) {
      return fail(400, "تاریخ پایان نمی‌تواند قبل از شروع باشد", "BAD_RANGE");
    }

    await prisma.cyclePeriod.update({
      where: { id: existing.id },
      data: { end: parsed.data.end ? startOfDayUtcFromIso(parsed.data.end) : null },
    });
    return ok({ done: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[cycle patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "شناسه لازم است", "VALIDATION");
    const existing = await prisma.cyclePeriod.findFirst({ where: { id, householdId } });
    if (!existing) return fail(404, "یافت نشد", "NOT_FOUND");
    await prisma.cyclePeriod.delete({ where: { id: existing.id } });
    return ok({ done: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[cycle delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
