import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";

/** Global search across household-scoped entities. Private moods/checkins excluded. */
export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) return ok({ results: [] });

    const contains = { contains: q, mode: "insensitive" as const };

    const [expenses, shopping, tasks, events, memories, goals] = await Promise.all([
      prisma.expense.findMany({
        where: { householdId, OR: [{ title: contains }, { note: contains }] },
        select: { id: true, title: true, amount: true, category: true, date: true },
        take: 5,
      }),
      prisma.shoppingItem.findMany({
        where: { householdId, title: contains },
        select: { id: true, title: true, completed: true },
        take: 5,
      }),
      prisma.task.findMany({
        where: { householdId, OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, status: true },
        take: 5,
      }),
      prisma.eventModel.findMany({
        where: { householdId, title: contains },
        select: { id: true, title: true, date: true, kind: true },
        take: 5,
      }),
      prisma.memory.findMany({
        where: { householdId, OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, date: true },
        take: 5,
      }),
      prisma.goal.findMany({
        where: { householdId, title: contains },
        select: { id: true, title: true, targetAmount: true },
        take: 5,
      }),
    ]);

    return ok({
      results: {
        expenses, shopping, tasks, events, memories, goals,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[search]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
