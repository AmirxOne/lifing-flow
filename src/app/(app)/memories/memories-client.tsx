"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { formatJalali } from "@/lib/jalali";

interface Memory {
  id: string; title: string; description: string | null; date: string;
  tags: string[] | null;
  createdBy: { id: string; fullName: string };
}

export function MemoriesClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date()));
  const [tags, setTags] = useState("");
  const [search, setSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => api<{ items: Memory[] }>("/api/memories"),
  });

  const createMutation = useMutation({
    mutationFn: () => api("/api/memories", {
      method: "POST",
      json: {
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        tags: tags.split(/[،,]/).map((s) => s.trim()).filter(Boolean).length ? tags.split(/[،,]/).map((s) => s.trim()).filter(Boolean) : undefined,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.push("خاطره ثبت شد 💞", "success");
      setModalOpen(false);
      setTitle(""); setDescription(""); setTags("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/memories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.push("خاطره حذف شد", "success");
    },
  });

  async function askDelete(m: Memory) {
    const yes = await confirm({
      title: "حذف خاطره",
      body: `خاطره «${m.title}» حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteMutation.mutate(m.id);
  }

  const items = (listQuery.data?.items ?? []).filter(
    (m) => !search.trim() || m.title.includes(search.trim()) || (m.description ?? "").includes(search.trim()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">خاطرات ما</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ خاطره جدید</Button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="جستجو در خاطره‌ها…"
        className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-ink-soft"
      />

      {listQuery.isLoading ? (
        <div className="space-y-2"><SkeletonBlock className="h-20" /><SkeletonBlock className="h-20" /></div>
      ) : listQuery.isError ? (
        <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => listQuery.refetch()}>تلاش دوباره</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>📖</span>}
          title={search.trim() ? "چیزی پیدا نشد" : "هنوز خاطره‌ای ندارید"}
          description="اولین سفر، اولین قرار، هر لحظه‌ی خوب — اینجا بمانند."
          action={!search.trim() ? <Button size="sm" onClick={() => setModalOpen(true)}>+ خاطره جدید</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold">{m.title}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    📅 {formatJalali(new Date(m.date))} · ثبت توسط {m.createdBy.id === me?.id ? "من" : m.createdBy.fullName}
                  </div>
                </div>
                <button onClick={() => askDelete(m)} className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
              </div>
              {m.description && (
                <p className="mt-2 text-[13px] leading-6 text-ink-soft">{m.description}</p>
              )}
              {m.tags && m.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tags.map((t) => <span key={t} className="badge badge-gray">#{t}</span>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="خاطره جدید"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={createMutation.isPending} disabled={!title.trim()} onClick={() => createMutation.mutate()}>ثبت</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="مثلاً اولین سفر مشترک" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ خاطره</label>
            <JalaliDatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">شرح</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" placeholder="چی شد که خوب بود؟" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">برچسب‌ها (با ویرگول جدا کنید)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="سفر، شمال" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
