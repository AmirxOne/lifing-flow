"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const EMOJIS = ["🏠", "💞", "🌟", "🏡", "🌿", "☕", "🌙", "🐱"];

export function SetupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        json: { fullName, email, password, householdName, householdEmoji: emoji },
      });
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-[40px]" aria-hidden>🏡</div>
          <h1 className="mt-2 text-[20px] font-black">لایف‌هاب را راه بیندازید</h1>
          <p className="mt-1 text-[13px] text-ink-soft">خانواده‌تان را بسازید و همسرتان را دعوت کنید</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="full-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام و نام خانوادگی</label>
            <input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} className={inputCls} placeholder="مثلاً امیرحسین" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">ایمیل</label>
            <input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز عبور (حداقل ۸ کاراکتر)</label>
            <input id="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>

          <div className="rounded-lg border border-dashed border-line p-3">
            <div>
              <label htmlFor="household-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام خانواده</label>
              <input id="household-name" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} required minLength={2} className={inputCls} placeholder="مثلاً خانه ما" />
            </div>
            <div className="mt-3">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار خانواده</span>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={`آواتار ${e}`} className={`h-10 w-10 rounded-lg border text-[18px] ${emoji === e ? "border-ink bg-paper-soft" : "border-line hover:bg-paper-soft"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}

          <Button type="submit" loading={loading} className="h-11 w-full text-[14px]">
            ساخت خانواده
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-ink-faint">
          اپلیکیشن خصوصی زندگی مشترک دو نفره — ثبت‌نام عمومی بسته است
        </p>
      </div>
    </div>
  );
}
