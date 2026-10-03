"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/register", { method: "POST", json: { fullName, email, password } });
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت‌نام — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-[40px]" aria-hidden>🏡</div>
          <h1 className="mt-2 text-[20px] font-black">ساخت حساب لایف‌هاب</h1>
          <p className="mt-1 text-[13px] text-ink-soft">چند ثانیه تا شروع زندگی مشترکِ منظم‌تر</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام و نام خانوادگی</label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
              placeholder="مثلاً سارا محمدی"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">ایمیل</label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز عبور</label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
              placeholder="حداقل ۸ کاراکتر"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>
          )}

          <Button type="submit" loading={loading} className="h-11 w-full text-[14px]">
            ساخت حساب
          </Button>

          <p className="pt-1 text-center text-[12px] text-ink-soft">
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <Link href="/login" className="font-bold text-ink underline underline-offset-4">وارد شوید</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
