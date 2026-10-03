import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity, isMember } from "@/server/household";
import { PRIORITIES, RECURRENCES } from "@/lib";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است").nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  recurrenceInterval: z.number().int().min(1).max(365).optional(),
  status: z.enum(["OPEN", "DONE"]).optional(),
});

/** Advance a recurring task's dueDate after completion (server-side rule). */
function nextDueDate(current: Date, recurrence: string, interval: number): Date | null {
  const d = new Date(current);
  switch (recurrence) {
    case "DAILY": d.setDate(d.getDate() + interval); return d;
    case "WEEKLY": d.setDate(d.getDate() + 7 * interval); return d;
    case "MONTHLY": {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + interval);
      const lastOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastOfTarget));
      return d;
    }
    case "CUSTOM": d.setDate(d.getDate() + interval); return d;
    default: return null;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { user, householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.task.findFirst({
      where: { id, householdId },
      select: { id: true, title: true, status: true, recurrence: true, recurrenceInterval: true, dueDate: true },
    });
    if (!existing) return fail(404, "کار پیدا نشد", "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    if (d.assignedToId && !(await isMember(householdId, d.assignedToId))) {
      return fail(400, "این فرد عضو خانواده شما نیست", "INVALID_ASSIGNEE");
    }

    // completing a recurring task → mark THIS one done and spawn the next occurrence
    if (d.status === "DONE" && existing.status === "OPEN") {
      if (existing.recurrence !== "NONE" && existing.dueDate) {
        const next = nextDueDate(existing.dueDate, existing.recurrence, existing.recurrenceInterval);
        if (next) {
          await prisma.task.create({
            data: {
              householdId,
              title: existing.title,
              description: null,
              assignedToId: d.assignedToId ?? null,
              dueDate: next,
              priority: "NORMAL",
              recurrence: existing.recurrence,
              recurrenceInterval: existing.recurrenceInterval,
            },
          });
        }
      }
      const task = await prisma.task.update({
        where: { id },
        data: { status: "DONE", completedAt: new Date(), completedById: user.id },
        include: {
          assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
          completedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
        },
      });
      await logActivity({
        householdId,
        userId: user.id,
        type: "TASK_DONE",
        summary: `${user.fullName} کار «${task.title}» را انجام داد`,
        entityId: task.id,
        notifType: "TASK",
        notifTitle: "کار خانه انجام شد",
        notifLink: "/tasks",
      });
      return ok(task);
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.assignedToId !== undefined ? { assignedToId: d.assignedToId } : {}),
        ...(d.dueDate !== undefined ? { dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00+03:30`) : null } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.recurrence !== undefined ? { recurrence: d.recurrence } : {}),
        ...(d.recurrenceInterval !== undefined ? { recurrenceInterval: d.recurrenceInterval } : {}),
        ...(d.status !== undefined ? { status: d.status, ...(d.status === "OPEN" ? { completedAt: null, completedById: null } : {}) } : {}),
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, avatarEmoji: true } },
        completedBy: { select: { id: true, fullName: true, avatarEmoji: true } },
      },
    });
    return ok(task);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[task patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { householdId } = await requireHousehold();
    const { id } = await params;
    const existing = await prisma.task.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!existing) return fail(404, "کار پیدا نشد", "NOT_FOUND");
    await prisma.task.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[task delete]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
