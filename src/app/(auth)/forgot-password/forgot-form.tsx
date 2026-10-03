"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ sent: boolean; resetPath?: string }>("/api/auth/forgot-password", {
        method: "POST",
        json: { email },
      });
      setSent(true);
      setResetPath(res.resetPath ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-[40px]" aria-hidden>🔑</div>
          <h1 className="mt-2 text-[20px] font-black">فراموشی رمز عبور</h1>
          <p className="mt-1 text-[13px] text-ink-soft">ایمیل حسابتان را وارد کنید تا لینک بازیابی بسازیم</p>
        </div>

        {sent ? (
          <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <div className="rounded-md bg-emerald-50 px-3 py-2.5 text-[12px] leading-6 text-emerald-700">
              ✅ درخواست ثبت شد. چون این اپ خصوصی و بدون سرور ایمیل است، لینک بازیابی مستقیماً همین‌جا نمایش داده می‌شود:
            </div>
            {resetPath ? (
              <Link
                href={resetPath}
                className="block rounded-md bg-ink px-4 py-2.5 text-center text-[13px] font-bold text-white transition-colors hover:bg-[#2a2a2e]"
              >
                تعیین رمز جدید
              </Link>
            ) : (
              <p className="text-center text-[12px] text-ink-soft">
                اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ساخته می‌شود.
              </p>
            )}
            <Link href="/login" className="block text-center text-[12px] text-ink-soft underline underline-offset-4">
              بازگشت به ورود
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-5 shadow-sm">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">ایمیل</label>
              <input
                id="email"
                type="email"
                dir="ltr"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
                placeholder="you@example.com"
              />
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
            <Button type="submit" loading={loading} className="h-11 w-full text-[14px]">
              ساخت لینک بازیابی
            </Button>
            <p className="pt-1 text-center text-[12px] text-ink-soft">
              <Link href="/login" className="font-bold text-ink underline underline-offset-4">بازگشت به ورود</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
