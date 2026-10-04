import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { prisma } from "@/server/db";
import { ok, fail } from "@/server/http";
import { requireHousehold, HttpError } from "@/server/auth/session";

// Photo upload for memories / expense receipts — stored on disk under the
// household's own directory; served back only through the scoped GET route.
const MAX_BYTES = Number(process.env.UPLOADS_MAX_BYTES ?? 5_242_880); // 5MB
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);
const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? "./data/uploads";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return fail(400, "فایلی ارسال نشده است", "NO_FILE");
    }
    if (file.size > MAX_BYTES) {
      return fail(413, `حجم فایل بیشتر از حد مجاز است (حداکثر ${Math.round(MAX_BYTES / 1024 / 1024)} مگابایت)`, "TOO_LARGE");
    }
    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return fail(415, "فقط تصویر (JPG، PNG، WebP یا GIF) قابل ارسال است", "BAD_TYPE");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const hash = sha256(buf);
    const name = `${hash}${ext}`; // content-addressed: same photo = same file

    const dir = join(UPLOADS_ROOT, householdId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buf);

    return ok({ url: `/api/uploads/${name}`, size: buf.length, hash });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[upload]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
