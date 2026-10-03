import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { logActivity } from "@/server/household";
import { DATE_SETTINGS } from "@/lib";

const ideaSchema = z.object({
  title: z.string().trim().min(1, "عنوان ایده را وارد کنید").max(100),
  description: z.string().trim().max(1000).optional(),
  budget: z.number().int().min(0).max(9_999_999_999).nullable().optional(),
  setting: z.enum(DATE_SETTINGS).default("ANY"),
  time: z.string().trim().max(40).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const sp = req.nextUrl.searchParams;
    const setting = sp.get("setting");
    const maxBudget = sp.get("maxBudget");

    const items = await prisma.dateIdea.findMany({
      where: {
        householdId,
        done: false,
        ...(setting && DATE_SETTINGS.includes(setting as never) ? { OR: [{ setting }, { setting: "ANY" }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = maxBudget
      ? items.filter((i) => i.budget === null || i.budget <= Number(maxBudget))
      : items;

    return ok({ items: filtered });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[date ideas]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, householdId } = await requireHousehold();
    const body = await req.json().catch(() => null);
    const parsed = ideaSchema.safeParse(body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "داده نامعتبر است", "VALIDATION");
    const d = parsed.data;

    const idea = await prisma.dateIdea.create({
      data: {
        householdId,
        title: d.title,
        description: d.description ?? null,
        budget: d.budget ?? null,
        setting: d.setting,
        time: d.time ?? null,
      },
    });

    await logActivity({
      householdId,
      userId: user.id,
      type: "DATE_IDEA_ADDED",
      summary: `${user.fullName} ایده قرار «${idea.title}» را ثبت کرد`,
      entityId: idea.id,
      notifType: "ACTIVITY",
      notifTitle: "ایده قرار جدید",
      notifLink: "/date-night",
    });

    return ok(idea, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[date idea create]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
