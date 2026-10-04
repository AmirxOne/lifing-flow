import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { requireHousehold, HttpError } from "@/server/auth/session";
import { fail } from "@/server/http";

// Scoped file serving: a photo is ONLY reachable by members of the household
// that uploaded it — the file lives in that household's directory and we
// resolve it with the caller's session household, never a client path.
const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? "./data/uploads";
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { householdId } = await requireHousehold();
    const { name } = await params;

    // sanitize: only a bare filename, no traversal
    const safe = basename(name);
    if (safe !== name || !/^[a-f0-9]{64}\.[a-z]+$/.test(safe)) {
      return fail(400, "نام فایل نامعتبر است", "BAD_NAME");
    }
    const ext = extname(safe);
    const type = TYPES[ext];
    if (!type) return fail(415, "نوع فایل پشتیبانی نمی‌شود", "BAD_TYPE");

    let buf: Buffer;
    try {
      buf = await readFile(join(UPLOADS_ROOT, householdId, safe));
    } catch {
      return fail(404, "فایل پیدا نشد", "NOT_FOUND");
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    console.error("[upload-get]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
