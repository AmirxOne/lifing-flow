import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { jalaliMonthKey } from "@/lib";

// Monthly household provisions ("تهیه ماهانه") — one list per Jalali month.
// The household carries its recurring staples: at month start you copy the
// previous month's list, then check items off as you buy them (or defer
// an item to next month).

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const createSchema = z.object({
  title: z.string().trim().min(1, "نام قلم را وارد کنید").max(100),
  quantity: z.string().trim().max(20).optional(),
  note: z.string().trim().max(200).optional(),
});

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  let ny = y, nm = m + delta;
  while (nm > 12) { nm -= 12; ny += 1; }
  while (nm < 1) { nm += 12; ny -= 1; }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    let month = sp.get("month");
    if (!month || !MONTH_KEY.test(month)) month = jalaliMonthKey();

    const items = await prisma.monthlyProvision.findMany({
      where: { householdId, monthKey: month },
      orderBy: { createdAt: "asc" },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });

    // does the PREVIOUS month have anything to suggest copying?
    const prevKey = shiftMonthKey(month, -1);
    const prevCount = await prisma.monthlyProvision.count({
      where: { householdId, monthKey: prevKey },
    });

    return ok({ monthKey: month, items, prevMonthHasItems: prevCount > 0 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[provisions list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    let month = sp.get("month");
    if (!month || !MONTH_KEY.test(month)) month = jalaliMonthKey();

    // copy-mode: clone previous month's list into this month (dedup by title)
    if (sp.get("copy") === "1") {
      const prevKey = shiftMonthKey(month, -1);
      const prev = await prisma.monthlyProvision.findMany({
        where: { householdId, monthKey: prevKey },
      });
      const existing = new Set(
        (await prisma.monthlyProvision.findMany({
          where: { householdId, monthKey: month },
          select: { title: true },
        })).map((p) => p.title.trim()),
      );
      const toAdd = prev.filter((p) => !existing.has(p.title.trim()));
      if (toAdd.length) {
        await prisma.monthlyProvision.createMany({
          data: toAdd.map((p) => ({
            householdId,
            monthKey: month,
            title: p.title,
            quantity: p.quantity,
            note: p.note,
            status: "PENDING",
            createdById: user.id,
          })),
        });
      }
      return ok({ copied: toAdd.length }, { status: 201 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    // duplicate title in the same month → friendly error
    const dup = await prisma.monthlyProvision.findFirst({
      where: { householdId, monthKey: month, title: d.title },
    });
    if (dup) return fail(409, "این قلم قبلاً در همین ماه اضافه شده است", "DUPLICATE");

    const created = await prisma.monthlyProvision.create({
      data: {
        householdId,
        monthKey: month,
        title: d.title,
        quantity: d.quantity ?? "1",
        ...(d.note ? { note: d.note } : {}),
        createdById: user.id,
      },
    });
    return ok({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[provisions create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

const patchSchema = z.object({
  status: z.enum(["PENDING", "BOUGHT"]).optional(),
  defer: z.literal(true).optional(), // → move to next month, PENDING
});

export async function PATCH(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "شناسه لازم است", "VALIDATION");

    const existing = await prisma.monthlyProvision.findFirst({ where: { id, householdId } });
    if (!existing) return fail(404, "یافت نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, "داده نامعتبر است", "VALIDATION");

    if (parsed.data.defer) {
      await prisma.monthlyProvision.update({
        where: { id: existing.id },
        data: { monthKey: shiftMonthKey(existing.monthKey, 1), status: "PENDING" },
      });
      return ok({ deferred: true });
    }

    await prisma.monthlyProvision.update({
      where: { id: existing.id },
      data: parsed.data.status ? { status: parsed.data.status } : {},
    });
    return ok({ done: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[provisions patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "شناسه لازم است", "VALIDATION");
    const existing = await prisma.monthlyProvision.findFirst({ where: { id, householdId } });
    if (!existing) return fail(404, "یافت نشد", "NOT_FOUND");
    await prisma.monthlyProvision.delete({ where: { id: existing.id } });
    return ok({ done: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[provisions delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
