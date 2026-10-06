"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, SkeletonBlock } from "@/components/ui/card";
import { cn } from "@/lib";

interface HouseholdInfo {
  id: string; name: string; avatarEmoji: string;
  users: { id: string; fullName: string; email: string; avatarEmoji: string | null }[];
  invitations: { id: string; code: string; expiresAt: string }[];
}

const HH_EMOJIS = ["🏠", "💞", "🌟", "🏡", "🌿", "☕", "🌙", "🐱", "🍳", "🧁"];
const ME_EMOJIS = ["😎", "🌸", "🦁", "🐧", "🦊", "🐻", "☕", "🎸", "👩", "👨"];

export function SettingsClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me, refresh, logout } = useAuth();

  const [hhName, setHhName] = useState("");
  const [hhEmoji, setHhEmoji] = useState("🏠");
  const [myEmoji, setMyEmoji] = useState("");
  const [myName, setMyName] = useState("");
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
    if (me) {
      setMyEmoji(me.avatarEmoji ?? "");
      setMyName(me.fullName ?? "");
    }
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
    mutationFn: () => api("/api/me", {
      method: "PATCH",
      json: { avatarEmoji: myEmoji || null, ...(myName.trim() && myName !== me?.fullName ? { fullName: myName.trim() } : {}) },
    }),
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

  const users = hhQuery.data?.users ?? [];
  const partner = users.find((u) => u.id !== me?.id);
  const invite = hhQuery.data?.invitations[0];
  const myDirty = (myEmoji || null) !== (me?.avatarEmoji ?? null) || (myName.trim() !== "" && myName !== me?.fullName);

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-black">تنظیمات</h1>

      {/* ── accounts (all members of this household) ── */}
      <Card>
        <CardHeader
          title={`${hhQuery.data?.avatarEmoji ?? "🏠"} ${hhQuery.data?.name ?? "خانواده"}`}
          subtitle={partner ? `${users.length} نفر در این خانه` : "فقط شما — همسرتان را دعوت کنید"}
        />
        <CardBody className="space-y-2">
          {users.map((u) => {
            const isMe = u.id === me?.id;
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper-soft px-3 py-3">
                <div className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[20px]",
                  isMe ? "bg-ink text-white" : "border border-line bg-white",
                )} aria-hidden>
                  {u.avatarEmoji ?? (isMe ? "🙂" : "🫥")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold">{u.fullName}</span>
                    {isMe && <span className="badge shrink-0">شما</span>}
                    {!isMe && <span className="text-[10.5px] text-ink-faint">همسر</span>}
                  </div>
                  <div dir="ltr" className="mt-0.5 truncate text-left text-[11px] text-ink-faint">{u.email}</div>
                </div>
              </div>
            );
          })}

          {/* invite slot — shown when the partner seat is free */}
          {!partner && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-[18px] text-ink-faint" aria-hidden>＋</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink-soft">صندلی همسر خالی است</div>
                {invite ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <code dir="ltr" className="rounded bg-paper-soft px-2 py-1 font-mono text-[14px] tracking-widest">{invite.code}</code>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(invite.code); toast.push("کد کپی شد", "success"); }}>کپی</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="mt-1.5" loading={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
                    ساخت کد دعوت
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── my profile ── */}
      <Card>
        <CardHeader title="پروفایل من" subtitle={me?.email} />
        <CardBody className="space-y-3">
          <div>
            <label htmlFor="my-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام نمایشی</label>
            <input id="my-name" value={myName} onChange={(e) => setMyName(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار من</span>
            <div className="flex flex-wrap gap-2">
              {ME_EMOJIS.map((e) => (
                <button key={e} onClick={() => setMyEmoji(e)} aria-pressed={myEmoji === e} aria-label={`آواتار ${e}`} className={cn("h-10 w-10 rounded-lg border text-[18px]", myEmoji === e ? "border-ink bg-paper-soft" : "border-line hover:bg-paper-soft")}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" loading={saveAvatarMutation.isPending} disabled={!myDirty} onClick={() => saveAvatarMutation.mutate()}>
            ذخیره پروفایل
          </Button>
        </CardBody>
      </Card>

      {/* ── household ── */}
      <Card>
        <CardHeader title="خانواده" subtitle="نام و نشان خانه‌تان" />
        <CardBody className="space-y-3">
          <div>
            <label htmlFor="household-name" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام خانواده</label>
            <input id="household-name" value={hhName} onChange={(e) => setHhName(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">آواتار خانواده</span>
            <div className="flex flex-wrap gap-2">
              {HH_EMOJIS.map((e) => (
                <button key={e} onClick={() => setHhEmoji(e)} aria-pressed={hhEmoji === e} aria-label={`آواتار ${e}`} className={cn("h-10 w-10 rounded-lg border text-[18px]", hhEmoji === e ? "border-ink bg-paper-soft" : "border-line hover:bg-paper-soft")}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" variant="secondary" loading={saveHhMutation.isPending} disabled={!hhName.trim() || hhName === hhQuery.data?.name} onClick={() => saveHhMutation.mutate()}>
            ذخیره
          </Button>
        </CardBody>
      </Card>

      {/* ── password ── */}
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

      {/* ── danger zone ── */}
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
