import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/server/auth/session";

export interface ApiEnvelope {
  ok: boolean;
  data?: unknown;
  error?: { message: string; code?: string; extra?: unknown };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiEnvelope> {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string, code?: string, extra?: unknown): NextResponse<ApiEnvelope> {
  return NextResponse.json({ ok: false, error: { message, code, extra } }, { status });
}

/** Uniform route-handler wrapper: never leak stack traces to clients. */
export function handle<T>(fn: () => Promise<NextResponse<ApiEnvelope & { data?: T }>>): Promise<NextResponse<ApiEnvelope>> {
  return fn().catch((err: unknown) => {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return fail(400, first?.message ?? "داده ارسالی نامعتبر است", "VALIDATION", err.issues);
    }
    console.error("[api]", err);
    return fail(500, "خطای سرور — لطفاً دوباره تلاش کنید", "INTERNAL");
  });
}

export function parsePage(value: string | null, fallback = 1): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
