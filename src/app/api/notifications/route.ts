import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireUser, HttpError } from "@/server/auth/session";
import { parsePage } from "@/server/http";

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const countOnly = url.searchParams.get("count") === "1";

    const where = { userId: auth.id, ...(unreadOnly ? { readAt: null } : {}) };

    if (countOnly) {
      const unreadCount = await prisma.notification.count({ where: { userId: auth.id, readAt: null } });
      return ok({ unreadCount });
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unreadCount = items.filter((n) => !n.readAt).length;
    return ok({ items, unreadCount });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[notifications]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

/** Mark one or all as read. */
export async function PATCH(req: Request) {
  try {
    const auth = await requireUser();
    const body = await req.json().catch(() => ({}));
    const id = (body as { id?: string }).id;
    if (id) {
      await prisma.notification.updateMany({
        where: { id, userId: auth.id },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId: auth.id, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return ok({ marked: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[notifications patch]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
