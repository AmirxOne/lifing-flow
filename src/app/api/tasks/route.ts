import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { PRIORITIES, RECURRENCES } from "@/lib";

const taskSchema = z.object({
  title: z.string().trim().min(1, "عنوان کار را وارد کنید").max(120),
  description: z.string().trim().max(1000).optional(),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").nullable().optional(),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  recurrence: z.enum(RECURRENCES).default("NONE"),
  recurrenceInterval: z.number().int().min(1).max(365).default(1),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status"); // OPEN | DONE | all
    const mine = sp.get("mine") === "1";

    const where = {
      householdId,
      ...(status === "OPEN" || status === "DONE" ? { status } : {}),
    };

    const items = await prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
        completedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });
    return ok({ items });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[tasks list]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = taskSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.assignedToId && !(await isMember(householdId, d.assignedToId))) {
      return fail(400, "این فرد عضو خانواده شما نیست", "INVALID_ASSIGNEE");
    }

    const task = await prisma.task.create({
      data: {
        householdId,
        title: d.title,
        description: d.description ?? null,
        assignedToId: d.assignedToId ?? null,
        dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00+03:30`) : null,
        priority: d.priority,
        recurrence: d.recurrence,
        recurrenceInterval: d.recurrenceInterval,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
        completedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "TASK_ADDED",
      summary: `${user.fullName} کار «${task.title}» را ساخت`,
      entityId: task.id,
      notifType: "TASK",
      notifTitle: "کار خانه جدید",
      notifLink: "/tasks",
    });

    return ok(task, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[task create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
