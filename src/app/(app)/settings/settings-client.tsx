"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, SkeletonBlock } from "@/components/ui/card";
import { toEnDigits } from "@/lib/fa";
import { cn } from "@/lib";

interface HouseholdInfo {
  id: string; name: string; avatarEmoji: string;
  users: { id: string; fullName: string; email: string; avatarEmoji: string | null }[];
  invitations: { id: string; code: string; expiresAt: string }[];
}

const EMOJIS = ["🏠", "💞", "🌟", "🏡", "🌿", "☕", "🌙", "🐱", "🍳", "🧁"];

export function SettingsClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me, refresh, logout } = useAuth();

  const [hhName, setHhName] = useState("");
  const [hhEmoji, setHhEmoji] = useState("🏠");
  const [myEmoji, setMyEmoji] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const hhQuery = useQuery({
    queryKey: ["household"],
    queryFn: () => api<HouseholdInfo>("/api/household/settings"),
  });

  useEffect(() => {
    if (hhQuery.data) {
      setHhName(hhQuery.data.name);
      setHhEmoji(hhQuery.data.avatarEmoji);
    }
  }, [hhQuery.data]);

  useEffect(() => {
    if (me) setMyEmoji(me.avatarEmoji ?? "");
  }, [me]);

  const saveHhMutation = useMutation({
    mutationFn: () => api("/api/household/settings", {
      method: "PATCH",
      json: { name: hhName.trim(), avatarEmoji: hhEmoji },
    }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["household"] });
      await refresh();
      toast.push("تنظیمات خانواده ذخیره شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const saveAvatarMutation = useMutation({
    mutationFn: () => api("/api/me", { method: "PATCH", json: { avatarEmoji: myEmoji || null } }),
    onSuccess: async () => {
      await refresh();
      toast.push("پروفایل ذخیره شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api("/api/me/password", {
      method: "PUT",
      json: { oldPassword, newPassword },
    }),
    onSuccess: () => {
      setOldPassword("");
      setNewPassword("");
      toast.push("رمز عبور تغییر کرد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api<{ code: string }>("/api/household/invite", { method: "POST", json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household"] });
      toast.push("کد دعوت ساخته شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  async function leaveHousehold() {
    const yes = await confirm({
      title: "ترک خانواده",
      body: "با ترک خانواده، دسترسی شما به همه داده‌های مشترک قطع می‌شود. اگر نفر آخر باشید، خانواده و داده‌هایش حذف می‌شوند.",
      confirmLabel: "ترک می‌کنم",
      danger: true,
    });
    if (!yes) return;
    try {
      await api("/api/household/settings", { method: "DELETE" });
      await refresh();
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  if (hhQuery.isLoading) {
    return <div className="space-y-3"><SkeletonBlock className="h-32" /><SkeletonBlock className="h-32" /></div>;
  }

  const partner = hhQuery.data?.users.find((u) => u.id !== me?.id);
  const invite = hhQuery.data?.invitations[0];

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-black">تنظیمات</h1>

      {/* household */}
      <Card>
        <CardHeader title="خانواده" subtitle={partner ? `همسر: ${partner.fullName}` : "همسری ندارید — دعوت کنید"} />
        <CardBody className="space-y-3">
          <div>
            <label htmlFor="household-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام خانواده</label>
            <input id="household-name" value={hhName} onChange={(e) => setHhName(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار خانواده</span>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setHhEmoji(e)} aria-pressed={hhEmoji === e} className={cn("h-10 w-10 rounded-lg border text-[18px]", hhEmoji === e ? "border-ink bg-paper-soft" : "border-line hover:bg-paper-soft")}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" loading={saveHhMutation.isPending} disabled={!hhName.trim()} onClick={() => saveHhMutation.mutate()}>
            ذخیره
          </Button>

          {!partner && (
            <div className="rounded-lg border border-dashed border-line p-3">
              <div className="text-[12px] text-ink-soft">همسرتان را دعوت کنید</div>
              {invite ? (
                <div className="mt-2 flex items-center justify-between">
                  <code dir="ltr" className="rounded bg-paper-soft px-2 py-1 font-mono text-[14px] tracking-widest">{invite.code}</code>
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(invite.code)}>کپی</Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" className="mt-2" loading={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
                  ساخت کد دعوت
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* profile */}
      <Card>
        <CardHeader title="پروفایل من" subtitle={me?.email} />
        <CardBody className="space-y-3">
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار من</span>
            <div className="flex flex-wrap gap-2">
              {["😎", "🌸", "🦁", "🐧", "🦊", "🐻", "☕", "🎸"].map((e) => (
                <button key={e} onClick={() => setMyEmoji(e)} aria-pressed={myEmoji === e} className={cn("h-10 w-10 rounded-lg border text-[18px]", myEmoji === e ? "border-ink bg-paper-soft" : "border-line hover:bg-paper-soft")}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" variant="secondary" loading={saveAvatarMutation.isPending} onClick={() => saveAvatarMutation.mutate()}>
            ذخیره پروفایل
          </Button>
        </CardBody>
      </Card>

      {/* password */}
      <Card>
        <CardHeader title="تغییر رمز عبور" />
        <CardBody className="space-y-3">
          <div>
            <label htmlFor="old-password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز فعلی</label>
            <input id="old-password" type="password" dir="ltr" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-[12px] font-medium text-ink-soft">رمز جدید (حداقل ۸ کاراکتر)</label>
            <input id="new-password" type="password" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
          <Button size="sm" variant="secondary" loading={passwordMutation.isPending} disabled={!oldPassword || newPassword.length < 8} onClick={() => passwordMutation.mutate()}>
            تغییر رمز
          </Button>
        </CardBody>
      </Card>

      {/* privacy note */}
      <Card>
        <CardHeader title="حریم خصوصی" />
        <CardBody className="space-y-2 text-[12px] leading-6 text-ink-soft">
          <div>🔒 حال‌وهوا و چک‌این «خصوصی» فقط برای خودتان قابل مشاهده است — این محدودیت در سرور اعمال می‌شود.</div>
          <div>👀 داده‌های خانواده فقط برای دو نفر شما قابل دسترسی است.</div>
        </CardBody>
      </Card>

      {/* danger zone */}
      <Card className="border-red-200">
        <CardHeader title="منطقه خطر" subtitle="اقدامات برگشت‌ناپذیر" />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="danger" size="sm" onClick={leaveHousehold}>
            ترک خانواده
          </Button>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            خروج از حساب
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
