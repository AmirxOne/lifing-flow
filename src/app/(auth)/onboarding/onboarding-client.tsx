"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toEnDigits } from "@/lib/fa";
import { faNum } from "@/lib";

type Mode = "invite" | "join";

export function OnboardingClient({ defaultName, hasHousehold }: { defaultName: string; hasHousehold: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(hasHousehold ? "invite" : "join");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateInvite() {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ code: string; expiresAt: string }>("/api/household/invite", {
        method: "POST",
        json: inviteeEmail ? { inviteeEmail } : {},
      });
      setInviteCode(res.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function joinHousehold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/household/join", { method: "POST", json: { code } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function goDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-soft px-4 py-10">
      <div className="w-full max-w-sm">
        {mode === "invite" && (
          <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-black">دعوت همسرتان 💞</h2>
            <p className="text-[13px] leading-6 text-ink-soft">
              سلام {defaultName.split(" ")[0]}! این کد را برای همسرتان بفرستید — با آن در صفحه
              «پیوستن به خانواده» حسابش را می‌سازد و به شما می‌پیوندد. کد تا ۷ روز اعتبار دارد.
            </p>

            {inviteCode ? (
              <div className="rounded-lg border border-dashed border-ink-soft bg-paper-soft p-4 text-center">
                <div className="text-[12px] text-ink-soft">کد دعوت شما</div>
                <div dir="ltr" className="mt-1 font-mono text-[26px] font-black tracking-[0.3em]">{inviteCode}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigator.clipboard?.writeText(inviteCode)}
                >
                  کپی کد
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="inviteeEmail" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                    ایمیل همسر (اختیاری — دعوت فقط برای او)
                  </label>
                  <input
                    id="inviteeEmail"
                    type="email"
                    dir="ltr"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
                    placeholder="partner@example.com"
                  />
                </div>
                <Button onClick={generateInvite} loading={loading} className="w-full">ساخت کد دعوت</Button>
              </div>
            )}

            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}

            <Button variant="ghost" className="w-full" onClick={goDashboard}>
              فعلاً بعداً — برو به داشبورد
            </Button>
          </div>
        )}

        {mode === "join" && (
          <form onSubmit={joinHousehold} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-black">پیوستن به خانواده</h2>
            <p className="text-[13px] leading-6 text-ink-soft">
              حساب شما هنوز به هیچ خانواده‌ای وصل نیست. کد دعوتی را که همسرتان داده وارد کنید.
            </p>
            <div>
              <label htmlFor="code" className="mb-1.5 block text-[12px] font-medium text-ink-soft">کد دعوت</label>
              <input
                id="code"
                required
                dir="ltr"
                value={code}
                onChange={(e) => setCode(toEnDigits(e.target.value).toUpperCase())}
                className="h-12 w-full rounded-md border border-line bg-white px-3 text-center font-mono text-[18px] tracking-[0.25em] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
                placeholder="XXXXXXXX"
              />
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
            <Button type="submit" loading={loading} className="w-full">پیوستن</Button>
          </form>
        )}
      </div>
    </div>
  );
}
