"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { FilterPanel } from "@/components/ui/filter-panel";
import { FaInput } from "@/components/ui/fa-input";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Card, CardHeader, CardBody, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import {
  faPrice, faCount, CATEGORY_FA, CATEGORY_EMOJI, EXPENSE_CATEGORIES,
} from "@/lib";
import { toEnDigits, faNum } from "@/lib/fa";
import { formatJalali } from "@/lib/jalali";

interface Expense {
  id: string; title: string; amount: number; category: string; date: string;
  isShared: boolean; note: string | null;
  payer: { id: string; fullName: string; avatarEmoji: string | null };
}

interface ListResponse {
  items: Expense[]; total: number; page: number; pageSize: number; sum: number;
}

interface BudgetItem {
  id: string; category: string; amount: number; spent: number; remaining: number; pct: number; over: boolean; nearLimit: boolean;
}

interface MeWithMembers {
  id: string;
  household: { id: string; name: string; partner: { id: string; fullName: string } | null } | null;
}

function todayIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date());
}

export function FinanceClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useAuth();
  const [tab, setTab] = useState<"expenses" | "budgets">("expenses");

  // filters
  const [category, setCategory] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [fCategory, setFCategory] = useState("FOOD");
  const [fDate, setFDate] = useState(todayIso());
  const [payerId, setPayerId] = useState("");
  const [isShared, setIsShared] = useState(true);
  const [note, setNote] = useState("");

  const membersQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeWithMembers>("/api/auth/me"),
  });
  const meId = me?.id ?? "";
  const partner = membersQuery.data?.household?.partner ?? null;

  const listQuery = useQuery({
    queryKey: ["expenses", { category, payer: payerFilter, q, from, to }],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (category) sp.set("category", category);
      if (payerFilter) sp.set("payer", payerFilter);
      if (q.trim()) sp.set("q", q.trim());
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      return api<ListResponse>(`/api/expenses?${sp.toString()}`);
    },
  });

  const budgetsQuery = useQuery({
    queryKey: ["budgets"],
    queryFn: () => api<{ month: string; items: BudgetItem[] }>("/api/budgets"),
    enabled: tab === "budgets",
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        amount: Number(toEnDigits(amount).replace(/[^0-9]/g, "")),
        category: fCategory,
        date: fDate,
        payerId: payerId || meId,
        isShared,
        note: note.trim() || undefined,
      };
      if (editing) {
        return api(`/api/expenses/${editing.id}`, { method: "PATCH", json: payload });
      }
      return api("/api/expenses", { method: "POST", json: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.push(editing ? "هزینه ویرایش شد" : "هزینه ثبت شد", "success");
      setModalOpen(false);
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا در ثبت", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.push("هزینه حذف شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا در حذف", "error"),
  });

  function openCreate() {
    setEditing(null);
    setTitle("");
    setAmount("");
    setFCategory("FOOD");
    setFDate(todayIso());
    setPayerId("");
    setIsShared(true);
    setNote("");
    setModalOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setTitle(e.title);
    setAmount(faNum(String(e.amount)));
    setFCategory(e.category);
    setFDate(new Date(e.date).toISOString().slice(0, 10));
    setPayerId(e.payer.id);
    setIsShared(e.isShared);
    setNote(e.note ?? "");
    setModalOpen(true);
  }

  async function askDelete(e: Expense) {
    const yes = await confirm({
      title: "حذف هزینه",
      body: `هزینه «${e.title}» به مبلغ ${faPrice(e.amount)} حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteMutation.mutate(e.id);
  }

  // balance calc (client mirror of server rule)
  const balance = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    let owed = 0;
    for (const e of items) {
      if (!e.isShared) continue;
      const half = e.amount / 2;
      if (e.payer.id === meId) owed += half;
      else owed -= half;
    }
    return owed;
  }, [listQuery.data, meId]);

  const categoryOptions = [{ value: "", label: "همه دسته‌ها" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: `${CATEGORY_EMOJI[c]} ${CATEGORY_FA[c]}` }))];
  const payerOptions = [
    { value: "", label: "هر دو" },
    { value: meId, label: "من" },
    ...(partner ? [{ value: partner.id, label: partner.fullName }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">مالی</h1>
        <Button size="sm" onClick={openCreate}>+ هزینه جدید</Button>
      </div>

      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as "expenses" | "budgets")}
        items={[
          { id: "expenses", label: "هزینه‌ها" },
          { id: "budgets", label: "بودجه ماه" },
        ]}
      />

      {tab === "expenses" && (
        <>
          {/* balance card */}
          <Card>
            <CardBody className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-ink-soft">وضعیت تسویه (نتیجه فیلتر فعلی)</div>
                <div className="mt-1 text-[16px] font-black">
                  {Math.abs(balance) < 1
                    ? "حساب‌ها برابر است"
                    : balance > 0
                      ? `${partner?.fullName ?? "همسر"} ${faPrice(balance)} بدهکار است`
                      : `${faPrice(-balance)} بدهکار ${partner?.fullName ?? "همسر"} هستید`}
                </div>
              </div>
              <span className="text-[28px]" aria-hidden>{Math.abs(balance) < 1 ? "🤝" : balance > 0 ? "⚖️" : "⚖️"}</span>
            </CardBody>
          </Card>

          {/* filters — collapsible */}
          <FilterPanel
            activeCount={[category, payerFilter, q.trim(), from, to].filter(Boolean).length}
            onReset={() => { setCategory(""); setPayerFilter(""); setQ(""); setFrom(""); setTo(""); }}
          >
            <div className="space-y-2">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو در هزینه‌ها…"
                className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={category} onChange={setCategory} options={categoryOptions} placeholder="دسته" />
                <Select value={payerFilter} onChange={setPayerFilter} options={payerOptions} placeholder="پرداخت‌کننده" />
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div className="text-[11px] text-ink-faint">از تاریخ
                    <JalaliDatePicker value={from} onChange={setFrom} />
                  </div>
                  <div className="text-[11px] text-ink-faint">تا تاریخ
                    <JalaliDatePicker value={to} onChange={setTo} />
                  </div>
                </div>
              </div>
            </div>
          </FilterPanel>

          {/* summary */}
          {listQuery.data && (
            <div className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-[12px] text-ink-soft">
              <span>{faCount(listQuery.data.total)} هزینه</span>
              <span className="font-bold text-ink">مجموع: {faPrice(listQuery.data.sum)}</span>
            </div>
          )}

          {/* list */}
          {listQuery.isLoading ? (
            <div className="space-y-2"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
          ) : listQuery.isError ? (
            <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => listQuery.refetch()}>تلاش دوباره</Button>} />
          ) : (listQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<span aria-hidden>💸</span>}
              title="هنوز هزینه‌ای ثبت نشده"
              description="اولین هزینه مشترک را ثبت کنید."
              action={<Button size="sm" onClick={openCreate}>+ هزینه جدید</Button>}
            />
          ) : (
            <div className="space-y-2">
              {listQuery.data!.items.map((e) => (
                <Card key={e.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[20px]" aria-hidden>{CATEGORY_EMOJI[e.category] ?? "📦"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold">{e.title}</span>
                        {e.isShared ? <span className="badge badge-blue">مشترک</span> : <span className="badge badge-gray">شخصی</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-faint">
                        {CATEGORY_FA[e.category]} · {formatJalali(new Date(e.date))} · پرداخت: {e.payer.id === meId ? "من" : e.payer.fullName}
                      </div>
                    </div>
                    <div className="shrink-0 text-left">
                      <div className="text-[13px] font-black">{faPrice(e.amount)}</div>
                      <div className="mt-1 flex gap-1">
                        <button onClick={() => openEdit(e)} className="rounded p-1 text-ink-faint hover:bg-paper-soft hover:text-ink" aria-label="ویرایش">✏️</button>
                        <button onClick={() => askDelete(e)} className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "budgets" && <BudgetsPanel data={budgetsQuery} />}

      {/* create/edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "ویرایش هزینه" : "ثبت هزینه جدید"}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>ذخیره</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="مثلاً خرید هفتگی"
            />
          </div>
          <div>
            <label htmlFor="expense-amount" className="mb-1.5 block text-[12px] font-medium text-ink-soft">مبلغ (تومان)</label>
            <FaInput
              allow="digits"
              id="expense-amount"
              aria-label="مبلغ (تومان)" data-field="amount"
              value={amount}
              onChange={setAmount}
              className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
              placeholder="۱۵۰٬۰۰۰"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="category" className="mb-1.5 block text-[12px] font-medium text-ink-soft">دسته</label>
              <Select value={fCategory} onChange={setFCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: `${CATEGORY_EMOJI[c]} ${CATEGORY_FA[c]}` }))} />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ</label>
              <JalaliDatePicker value={fDate} onChange={setFDate} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payer" className="mb-1.5 block text-[12px] font-medium text-ink-soft">پرداخت‌کننده</label>
              <Select
                value={payerId || meId}
                onChange={setPayerId}
                options={[
                  { value: meId, label: "من" },
                  ...(partner ? [{ value: partner.id, label: partner.fullName }] : []),
                ]}
              />
            </div>
            <div>
              <label htmlFor="kind" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نوع</label>
              <Select
                value={isShared ? "SHARED" : "PERSONAL"}
                onChange={(v) => setIsShared(v === "SHARED")}
                options={[
                  { value: "SHARED", label: "مشترک (نصف‌نصف)" },
                  { value: "PERSONAL", label: "شخصی" },
                ]}
              />
            </div>
          </div>
          <div>
            <label htmlFor="note-field" className="mb-1.5 block text-[12px] font-medium text-ink-soft">یادداشت (اختیاری)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft"
              placeholder="توضیح بیشتر…"
            />
          </div>
          {saveMutation.isError && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {saveMutation.error instanceof Error ? saveMutation.error.message : "خطا در ذخیره"}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function BudgetsPanel({ data }: { data: ReturnType<typeof useQuery<{ month: string; items: BudgetItem[] }>> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null); // category key
  const [amount, setAmount] = useState("");
  const [savingCat, setSavingCat] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ category, amt }: { category: string; amt: number }) => {
      return api("/api/budgets", { method: "PUT", json: { category, amount: amt } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.push("بودجه ذخیره شد", "success");
      setEditing(null);
      setAmount("");
      setSavingCat(null);
    },
    onError: (err) => {
      toast.push(err instanceof Error ? err.message : "خطا", "error");
      setSavingCat(null);
    },
  });

  if (data.isLoading) return <div className="space-y-2"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>;
  if (data.isError) return <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => data.refetch()}>تلاش دوباره</Button>} />;

  const items = data.data?.items ?? [];
  const byCat = new Map(items.map((i) => [i.category, i]));

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white px-4 py-2.5 text-[12px] text-ink-soft">
        بودجه ماه {data.data?.month ? faNum(data.data.month.replace("-", " - ")) : ""} — برای هر دسته سقف ماهانه تعیین کنید
      </div>
      {EXPENSE_CATEGORIES.map((cat) => {
        const b = byCat.get(cat);
        const pct = b?.pct ?? 0;
        return (
          <Card key={cat} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span aria-hidden>{CATEGORY_EMOJI[cat]}</span>
                <span className="text-[13px] font-bold">{CATEGORY_FA[cat]}</span>
              </div>
              <button
                onClick={() => { setEditing(editing === cat ? null : cat); setAmount(b ? faNum(String(b.amount)) : ""); }}
                className="text-[12px] font-bold text-ink-soft hover:text-ink"
              >
                {b ? "ویرایش" : "تعیین بودجه"}
              </button>
            </div>
            {editing === cat && (
              <div className="mt-3 flex gap-2">
                <FaInput
                  allow="digits"
                  value={amount}
                  onChange={setAmount}
                  className="h-10 flex-1 rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
                  placeholder="مبلغ ماهانه به تومان"
                />
                <Button
                  size="md"
                  loading={saveMutation.isPending && savingCat === cat}
                  onClick={() => {
                    setSavingCat(cat);
                    saveMutation.mutate({ category: cat, amt: Number(toEnDigits(amount).replace(/[^0-9]/g, "")) });
                  }}
                >
                  ذخیره
                </Button>
              </div>
            )}
            {b && editing !== cat && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-ink-faint">
                  <span>{faPrice(b.spent)} خرج شده</span>
                  <span className={b.over ? "font-bold text-red-600" : b.nearLimit ? "font-bold text-amber-600" : ""}>
                    {b.over ? `پرشده! ${faPrice(-b.remaining)} بیشتر` : `${faPrice(b.remaining)} باقی`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
                  <div
                    className={`h-full rounded-full transition-all ${b.over ? "bg-red-500" : b.nearLimit ? "bg-amber-500" : "bg-ink"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                {b.nearLimit && !b.over && (
                  <div className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                    ⚠️ به سقف بودجه نزدیک شدید ({faNum(String(pct))}٪)
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
