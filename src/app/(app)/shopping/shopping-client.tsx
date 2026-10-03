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
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SHOP_CATEGORIES, SHOP_CATEGORY_FA, PRIORITIES, PRIORITY_FA } from "@/lib";

interface Item {
  id: string; title: string; quantity: string; unit: string | null; category: string;
  priority: string; completed: boolean; note: string | null;
  addedBy: { id: string; fullName: string };
  assignedTo: { id: string; fullName: string } | null;
}

export function ShoppingClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useAuth();
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("۱");
  const [fCategory, setFCategory] = useState("GROCERY");
  const [priority, setPriority] = useState("NORMAL");
  const [assignedToId, setAssignedToId] = useState("");
  const [note, setNote] = useState("");

  const membersQuery = useQuery({ queryKey: ["me"], queryFn: () => api<{ household: { partner: { id: string; fullName: string } | null } | null }>("/api/auth/me") });
  const partner = membersQuery.data?.household?.partner ?? null;

  const listQuery = useQuery({
    queryKey: ["shopping", filter, categoryFilter],
    queryFn: () => {
      const sp = new URLSearchParams({ filter });
      if (categoryFilter) sp.set("category", categoryFilter);
      return api<{ items: Item[] }>(`/api/shopping?${sp}`);
    },
    refetchInterval: 20_000, // near-realtime via polling
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shopping"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createMutation = useMutation({
    mutationFn: () => api("/api/shopping", {
      method: "POST",
      json: {
        title: title.trim(),
        quantity: quantity || "1",
        category: fCategory,
        priority,
        note: note.trim() || undefined,
        assignedToId: assignedToId || null,
      },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("به لیست خرید اضافه شد", "success");
      setModalOpen(false);
      setTitle(""); setQuantity("۱"); setNote(""); setAssignedToId("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا در ثبت", "error"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api(`/api/shopping/${id}`, { method: "PATCH", json: { completed } }),
    onSuccess: invalidate,
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/shopping/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  async function askDelete(item: Item) {
    const yes = await confirm({
      title: "حذف آیتم",
      body: `«${item.title}» از لیست خرید حذف شود؟`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteMutation.mutate(item.id);
  }

  const items = listQuery.data?.items ?? [];
  const catOptions = [{ value: "", label: "همه دسته‌ها" }, ...SHOP_CATEGORIES.map((c) => ({ value: c, label: SHOP_CATEGORY_FA[c] }))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">لیست خرید</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ افزودن</Button>
      </div>

      <SegmentedTabs
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
        items={[
          { id: "pending", label: "در انتظار" },
          { id: "done", label: "خریداری‌شده" },
          { id: "all", label: "همه" },
        ]}
      />

      <Select value={categoryFilter} onChange={setCategoryFilter} options={catOptions} />

      {listQuery.isLoading ? (
        <div className="space-y-2"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
      ) : listQuery.isError ? (
        <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => listQuery.refetch()}>تلاش دوباره</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>🛒</span>}
          title={filter === "pending" ? "لیست خرید خالی است" : "موردی نیست"}
          description="چیزهای لازم خانه را اینجا جمع کنید — هر دو نفر می‌بینید."
          action={<Button size="sm" onClick={() => setModalOpen(true)}>+ افزودن</Button>}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className={`p-3 ${item.completed ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleMutation.mutate({ id: item.id, completed: !item.completed })}
                  aria-label={item.completed ? "برگشت به لیست" : "علامت خریداری‌شده"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${item.completed ? "border-emerald-600 bg-emerald-600 text-white" : "border-line hover:border-ink-soft"}`}
                >
                  {item.completed && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-medium ${item.completed ? "line-through" : ""}`}>
                    {item.title}
                    <span className="mr-1 text-[11px] text-ink-faint">×{item.quantity}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                    <span>{SHOP_CATEGORY_FA[item.category]}</span>
                    {item.priority !== "NORMAL" && (
                      <span className={`badge ${item.priority === "HIGH" ? "badge-red" : "badge-gray"}`}>{PRIORITY_FA[item.priority]}</span>
                    )}
                    {item.assignedTo && <span>· بر عهده {item.assignedTo.id === me?.id ? "من" : item.assignedTo.fullName}</span>}
                    {item.note && <span>· {item.note}</span>}
                  </div>
                </div>
                <button onClick={() => askDelete(item)} className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="افزودن به لیست خرید"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={createMutation.isPending} disabled={!title.trim()} onClick={() => createMutation.mutate()}>افزودن</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="item-title" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام کالا</label>
            <input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="مثلاً شیر"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="quantity" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تعداد</label>
              <input
              id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
                placeholder="۱"
              />
            </div>
            <div>
              <label htmlFor="category" className="mb-1.5 block text-[12px] font-medium text-ink-soft">دسته</label>
              <Select value={fCategory} onChange={setFCategory} options={SHOP_CATEGORIES.map((c) => ({ value: c, label: SHOP_CATEGORY_FA[c] }))} />
            </div>
            <div>
              <label htmlFor="priority" className="mb-1.5 block text-[12px] font-medium text-ink-soft">اولویت</label>
              <Select value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_FA[p] }))} />
            </div>
          </div>
          {partner && (
            <div>
              <label htmlFor="بر عهده (اختیاری)" className="mb-1.5 block text-[12px] font-medium text-ink-soft">بر عهده (اختیاری)</label>
              <Select
                value={assignedToId}
                onChange={setAssignedToId}
                options={[
                  { value: "", label: "مشخص نیست" },
                  { value: me?.id ?? "", label: "من" },
                  { value: partner.id, label: partner.fullName },
                ]}
              />
            </div>
          )}
          <div>
            <label htmlFor="note-field" className="mb-1.5 block text-[12px] font-medium text-ink-soft">یادداشت (اختیاری)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="مثلاً برند خاص"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
