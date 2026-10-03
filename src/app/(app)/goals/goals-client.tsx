"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FaInput } from "@/components/ui/fa-input";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { faPrice, faCount } from "@/lib";
import { toEnDigits, faNum } from "@/lib/fa";
import { formatJalali } from "@/lib/jalali";

interface Goal {
  id: string; title: string; targetAmount: number; deadline: string | null;
  note: string | null; completedAt: string | null;
  contributions: { id: string; amount: number; note: string | null; createdAt: string; user: { id: string; fullName: string } }[];
  saved: number; pct: number; done: boolean;
}

export function GoalsClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");

  const [contribGoal, setContribGoal] = useState<Goal | null>(null);
  const [contribAmount, setContribAmount] = useState("");

  const listQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => api<{ items: Goal[] }>("/api/goals"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createMutation = useMutation({
    mutationFn: () => api("/api/goals", {
      method: "POST",
      json: {
        title: title.trim(),
        targetAmount: Number(toEnDigits(target).replace(/[^0-9]/g, "")),
        deadline: deadline || null,
        note: note.trim() || undefined,
      },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("هدف ساخته شد", "success");
      setModalOpen(false);
      setTitle(""); setTarget(""); setDeadline(""); setNote("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا در ثبت", "error"),
  });

  const contribMutation = useMutation({
    mutationFn: () => api(`/api/goals/${contribGoal!.id}/contributions`, {
      method: "POST",
      json: { amount: Number(toEnDigits(contribAmount).replace(/[^0-9]/g, "")) },
    }),
    onSuccess: (res) => {
      invalidate();
      const completed = (res as { completed?: boolean }).completed;
      toast.push(completed ? "هدف تکمیل شد 🎉" : "پس‌انداز ثبت شد", "success");
      setContribGoal(null);
      setContribAmount("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/goals/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  async function askDelete(g: Goal) {
    const yes = await confirm({
      title: "حذف هدف",
      body: `هدف «${g.title}» و همه پس‌اندازهایش حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteMutation.mutate(g.id);
  }

  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">اهداف مشترک</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ هدف جدید</Button>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2"><SkeletonBlock className="h-24" /><SkeletonBlock className="h-24" /></div>
      ) : listQuery.isError ? (
        <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => listQuery.refetch()}>تلاش دوباره</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>🎯</span>}
          title="هنوز هدفی ندارید"
          description="سفر، خانه، هر رویای مشترکی — قدم‌به‌قدم پس‌اندازش کنید."
          action={<Button size="sm" onClick={() => setModalOpen(true)}>+ هدف جدید</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold">{g.title}</span>
                    {g.done && <span className="badge badge-green">تکمیل 🎉</span>}
                  </div>
                  {g.deadline && (
                    <div className="mt-0.5 text-[11px] text-ink-faint">مهلت: {formatJalali(new Date(g.deadline))}</div>
                  )}
                </div>
                <button onClick={() => askDelete(g)} className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="font-bold">{faCount(g.pct)}٪</span>
                  <span className="text-ink-faint">{faPrice(g.saved)} از {faPrice(g.targetAmount)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-paper-deep">
                  <div className={`h-full rounded-full transition-all ${g.done ? "bg-emerald-600" : "bg-ink"}`} style={{ width: `${g.pct}%` }} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-ink-faint">
                  {g.contributions.length > 0 ? `${faNum(String(g.contributions.length))} پس‌انداز` : "بدون پس‌انداز"}
                </span>
                {!g.done && (
                  <Button size="sm" variant="secondary" onClick={() => { setContribGoal(g); setContribAmount(""); }}>
                    + پس‌انداز
                  </Button>
                )}
              </div>

              {g.contributions.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-line pt-3">
                  {g.contributions.slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-[11px] text-ink-faint">
                      <span>{c.user.fullName}</span>
                      <span className="font-bold text-ink">{faPrice(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* create modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="هدف جدید"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={createMutation.isPending} disabled={!title.trim() || !target} onClick={() => createMutation.mutate()}>ساخت</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="goal-title" className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان هدف</label>
            <input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="مثلاً سفر شمال"
            />
          </div>
          <div>
            <label htmlFor="goal-amount" className="mb-1.5 block text-[12px] font-medium text-ink-soft">مبلغ هدف (تومان)</label>
            <FaInput
              allow="digits"
              value={target}
              onChange={setTarget}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="۱۰۰٬۰۰۰٬۰۰۰"
            />
          </div>
          <div>
            <label htmlFor="due-date" className="mb-1.5 block text-[12px] font-medium text-ink-soft">مهلت (اختیاری)</label>
            <JalaliDatePicker value={deadline} onChange={setDeadline} />
          </div>
          <div>
            <label htmlFor="note-field" className="mb-1.5 block text-[12px] font-medium text-ink-soft">یادداشت (اختیاری)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
            />
          </div>
        </div>
      </Modal>

      {/* contribution modal */}
      <Modal
        open={!!contribGoal}
        onClose={() => setContribGoal(null)}
        title={`پس‌انداز برای «${contribGoal?.title ?? ""}»`}
        subtitle={contribGoal ? `${faPrice(contribGoal.saved)} از ${faPrice(contribGoal.targetAmount)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setContribGoal(null)}>انصراف</Button>
            <Button loading={contribMutation.isPending} disabled={!contribAmount} onClick={() => contribMutation.mutate()}>ثبت</Button>
          </>
        }
      >
        <div>
          <label htmlFor="amount" className="mb-1.5 block text-[12px] font-medium text-ink-soft">مبلغ (تومان)</label>
          <FaInput
            allow="digits"
            value={contribAmount}
            onChange={setContribAmount}
            className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
            placeholder="۵۰۰٬۰۰۰"
          />
        </div>
      </Modal>
    </div>
  );
}
