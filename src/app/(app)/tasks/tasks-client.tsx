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
import { Select } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { PRIORITIES, PRIORITY_FA, RECURRENCES, RECURRENCE_FA } from "@/lib";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/fa";

interface Task {
  id: string; title: string; description: string | null; dueDate: string | null;
  priority: string; recurrence: string; status: string;
  assignedTo: { id: string; fullName: string } | null;
  completedBy: { id: string; fullName: string } | null;
}

export function TasksClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useAuth();
  const [status, setStatus] = useState<"OPEN" | "DONE" | "all">("OPEN");

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [recurrence, setRecurrence] = useState("NONE");
  const [assignedToId, setAssignedToId] = useState("");

  const membersQuery = useQuery({ queryKey: ["me"], queryFn: () => api<{ household: { partner: { id: string; fullName: string } | null } | null }>("/api/auth/me") });
  const partner = membersQuery.data?.household?.partner ?? null;

  const listQuery = useQuery({
    queryKey: ["tasks", status],
    queryFn: () => api<{ items: Task[] }>(`/api/tasks?status=${status}`),
    refetchInterval: 20_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createMutation = useMutation({
    mutationFn: () => api("/api/tasks", {
      method: "POST",
      json: {
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || null,
        priority,
        recurrence,
        assignedToId: assignedToId || null,
      },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("کار ساخته شد", "success");
      setModalOpen(false);
      setTitle(""); setDescription(""); setDueDate(""); setAssignedToId("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا در ثبت", "error"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/api/tasks/${id}`, { method: "PATCH", json: { status: next } }),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.push(vars.next === "DONE" ? "انجام شد 🎉" : "بازگشت به باز", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  async function askDelete(t: Task) {
    const yes = await confirm({
      title: "حذف کار",
      body: `«${t.title}» حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteMutation.mutate(t.id);
  }

  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">کارهای خانه</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ کار جدید</Button>
      </div>

      <SegmentedTabs
        value={status}
        onChange={(v) => setStatus(v as typeof status)}
        items={[
          { id: "OPEN", label: "باز" },
          { id: "DONE", label: "انجام‌شده" },
          { id: "all", label: "همه" },
        ]}
      />

      {listQuery.isLoading ? (
        <div className="space-y-2"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
      ) : listQuery.isError ? (
        <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => listQuery.refetch()}>تلاش دوباره</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>✅</span>}
          title={status === "OPEN" ? "کاری در انتظار نیست" : "موردی نیست"}
          description="کارهای تکرارشونده خانه را اینجا مدیریت کنید."
          action={<Button size="sm" onClick={() => setModalOpen(true)}>+ کار جدید</Button>}
        />
      ) : (
        <div className="space-y-2">
          {items.map((t) => {
            const overdue = t.status === "OPEN" && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString());
            return (
              <Card key={t.id} className={`p-3 ${t.status === "DONE" ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleMutation.mutate({ id: t.id, next: t.status === "OPEN" ? "DONE" : "OPEN" })}
                    aria-label={t.status === "OPEN" ? "علامت انجام‌شده" : "بازگشت به باز"}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${t.status === "DONE" ? "border-emerald-600 bg-emerald-600 text-white" : "border-line hover:border-ink-soft"}`}
                  >
                    {t.status === "DONE" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-bold ${t.status === "DONE" ? "line-through" : ""}`}>{t.title}</div>
                    {t.description && <div className="mt-0.5 text-[12px] text-ink-soft">{t.description}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      {t.dueDate && (
                        <span className={overdue ? "font-bold text-red-600" : ""}>
                          ⏰ {formatJalali(new Date(t.dueDate))}{overdue ? " (عقب‌افتاده)" : ""}
                        </span>
                      )}
                      {t.recurrence !== "NONE" && <span className="badge badge-blue">🔁 {RECURRENCE_FA[t.recurrence]}</span>}
                      {t.priority === "HIGH" && <span className="badge badge-red">{PRIORITY_FA[t.priority]}</span>}
                      {t.assignedTo && <span>· {t.assignedTo.id === me?.id ? "بر عهده من" : `بر عهده ${t.assignedTo.fullName}`}</span>}
                      {t.status === "DONE" && t.completedBy && <span>· انجام‌دهنده {t.completedBy.id === me?.id ? "من" : t.completedBy.fullName}</span>}
                    </div>
                  </div>
                  <button onClick={() => askDelete(t)} className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="کار جدید خانه"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={createMutation.isPending} disabled={!title.trim()} onClick={() => createMutation.mutate()}>ساخت</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="مثلاً ظرف‌ها"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">توضیح (اختیاری)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">مهلت (اختیاری)</label>
              <JalaliDatePicker value={dueDate} onChange={setDueDate} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">اولویت</label>
              <Select value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_FA[p] }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">تکرار</label>
              <Select value={recurrence} onChange={setRecurrence} options={RECURRENCES.map((r) => ({ value: r, label: RECURRENCE_FA[r] }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">بر عهده</label>
              <Select
                value={assignedToId}
                onChange={setAssignedToId}
                options={[
                  { value: "", label: "مشخص نیست" },
                  { value: me?.id ?? "", label: "من" },
                  ...(partner ? [{ value: partner.id, label: partner.fullName }] : []),
                ]}
              />
            </div>
          </div>
          {recurrence !== "NONE" && (
            <div className="rounded-md bg-paper-soft px-3 py-2 text-[11px] text-ink-soft">
              💡 با انجام این کار، نسخه بعدی‌اش خودکار ساخته می‌شود.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
