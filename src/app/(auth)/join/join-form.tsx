"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toEnDigits } from "@/lib/fa";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/join", {
        method: "POST",
        json: { code: toEnDigits(code).toUpperCase(), fullName, email, password },
      });
      router.push("/dashboard");
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
          <div className="text-[40px]" aria-hidden>💌</div>
          <h1 className="mt-2 text-[20px] font-black">به خانواده بپیوندید</h1>
          <p className="mt-1 text-[13px] text-ink-soft">کد دعوتی را که همسرتان داده وارد کنید</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="invite-code" className="mb-1.5 block text-[12px] font-medium text-ink-soft">کد دعوت</label>
            <input
              id="invite-code"
              dir="ltr"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`${inputCls} text-center font-mono text-[15px] tracking-[0.3em]`}
              placeholder="XXXXXXXX"
            />
          </div>
          <div>
            <label htmlFor="full-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام و نام خانوادگی</label>
            <input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} className={inputCls} placeholder="مثلاً سارا" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">ایمیل</label>
            <input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز عبور (حداقل ۸ کاراکتر)</label>
            <input id="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>

          {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}

          <Button type="submit" loading={loading} className="h-11 w-full text-[14px]">
            پیوستن به خانواده
          </Button>
        </form>

        <p className="mt-4 text-center">
          <a href="/login" className="text-[12px] text-ink-soft underline underline-offset-4 hover:text-ink">حساب دارید؟ وارد شوید</a>
        </p>
        <p className="mt-6 text-center text-[11px] text-ink-faint">
          اپلیکیشن خصوصی زندگی مشترک دو نفره — ورود فقط با کد دعوت
        </p>
      </div>
    </div>
  );
}
