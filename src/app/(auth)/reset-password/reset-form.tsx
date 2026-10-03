"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("رمزها یکسان نیستند");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { token, newPassword } });
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
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
          <div className="text-[40px]" aria-hidden>🔐</div>
          <h1 className="mt-2 text-[20px] font-black">رمز عبور جدید</h1>
          <p className="mt-1 text-[13px] text-ink-soft">رمز جدیدی برای حسابتان تعیین کنید</p>
        </div>

        {done ? (
          <div className="space-y-3 rounded-xl border border-line bg-white p-5 text-center shadow-sm">
            <div className="rounded-md bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-700">
              ✅ رمز عبور تغییر کرد. همه نشست‌های قبلی بسته شد. در حال انتقال به ورود…
            </div>
            <Link href="/login" className="block text-[12px] text-ink-soft underline underline-offset-4">رفتن به ورود</Link>
          </div>
        ) : !token ? (
          <div className="space-y-3 rounded-xl border border-line bg-white p-5 text-center shadow-sm">
            <div className="rounded-md bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
              ⚠️ لینک بازیابی نامعتبر است — توکنی در لینک نیست.
            </div>
            <Link href="/forgot-password" className="block text-[12px] font-bold text-ink underline underline-offset-4">ساخت لینک جدید</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-5 shadow-sm">
            <div>
              <label htmlFor="newPassword" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز جدید (حداقل ۸ کاراکتر)</label>
              <input
                id="newPassword"
                type="password"
                dir="ltr"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تکرار رمز جدید</label>
              <input
                id="confirm"
                type="password"
                dir="ltr"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
              />
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
            <Button type="submit" loading={loading} className="h-11 w-full text-[14px]">
              تغییر رمز
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
