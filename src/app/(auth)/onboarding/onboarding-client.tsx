"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { toEnDigits } from "@/lib/fa";
import { faNum } from "@/lib";

type Step = "choose" | "create" | "invite" | "join";

export function OnboardingClient({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [code, setCode] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const EMOJIS = ["🏠", "💞", "🌟", "🏡", "🌿", "☕", "🌙", "🐱"];

  async function createHousehold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/household", { method: "POST", json: { name, avatarEmoji: emoji } });
      await refresh();
      setStep("invite");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function generateInvite() {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ code: string; expiresAt: string }>("/api/household/invite", {
        method: "POST",
        json: inviteeEmail ? { inviteeEmail } : {},
      });
      setInviteCode(res.code);
      await qc.invalidateQueries();
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
      await refresh();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function skipToDashboard() {
    await refresh();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-soft px-4 py-10">
      <div className="w-full max-w-sm">
        {/* progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2" aria-hidden>
          {[1, 2].map((n) => {
            const active = step === "invite" || step === "join" ? 2 : 1;
            return (
              <span
                key={n}
                className={`h-2 w-2 rounded-full ${n <= active ? "bg-ink" : "bg-paper-deep"}`}
              />
            );
          })}
        </div>

        {step === "choose" && (
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <h1 className="text-center text-[18px] font-black">سلام {defaultName.split(" ")[0]} 👋</h1>
            <p className="mt-2 text-center text-[13px] leading-6 text-ink-soft">
              لایف‌هاب برای زندگی دونفره ساخته شده. یکی از این دو راه را انتخاب کنید:
            </p>
            <div className="mt-5 space-y-3">
              <button
                onClick={() => setStep("create")}
                className="w-full rounded-lg border border-line bg-white p-4 text-right transition-colors hover:border-ink-soft hover:bg-paper-soft"
              >
                <div className="text-[14px] font-bold">🏡 خانواده جدید بسازم</div>
                <div className="mt-1 text-[12px] text-ink-soft">همسرتان بعداً با کد دعوت به شما می‌پیوندد</div>
              </button>
              <button
                onClick={() => setStep("join")}
                className="w-full rounded-lg border border-line bg-white p-4 text-right transition-colors hover:border-ink-soft hover:bg-paper-soft"
              >
                <div className="text-[14px] font-bold">💌 کد دعوت دارم</div>
                <div className="mt-1 text-[12px] text-ink-soft">همسرتان قبلاً خانواده ساخته و کد داده است</div>
              </button>
            </div>
          </div>
        )}

        {step === "create" && (
          <form onSubmit={createHousehold} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-black">نام خانواده‌تان چی باشد؟</h2>
            <div>
              <label htmlFor="hname" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام خانواده</label>
              <input
                id="hname"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none transition-colors focus:border-ink-soft focus:ring-2 focus:ring-ink/10"
                placeholder="مثلاً خانهٔ سارا و امیر"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="آواتار خانواده">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={emoji === e}
                    onClick={() => setEmoji(e)}
                    className={`h-11 w-11 rounded-lg border text-[20px] transition-colors ${emoji === e ? "border-ink bg-paper-soft" : "border-line bg-white hover:bg-paper-soft"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("choose")}>بازگشت</Button>
              <Button type="submit" loading={loading} className="flex-1">ساخت خانواده</Button>
            </div>
          </form>
        )}

        {step === "invite" && (
          <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-black">دعوت همسرتان 💞</h2>
            <p className="text-[13px] leading-6 text-ink-soft">
              این کد را برای همسرتان بفرستید. با ثبت‌نام و وارد کردن کد، به خانواده شما می‌پیوندد. کد تا ۷ روز اعتبار دارد.
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

            <Button variant="ghost" className="w-full" onClick={skipToDashboard}>
              فعلاً بعداً — برو به داشبورد
            </Button>
          </div>
        )}

        {step === "join" && (
          <form onSubmit={joinHousehold} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-black">پیوستن به خانواده</h2>
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
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("choose")}>بازگشت</Button>
              <Button type="submit" loading={loading} className="flex-1">پیوستن</Button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-ink-faint">
          مرحله {faNum(step === "invite" || step === "join" ? 2 : 1)} از {faNum(2)}
        </p>
      </div>
    </div>
  );
}
