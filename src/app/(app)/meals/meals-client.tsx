"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { MEAL_SLOTS, MEAL_SLOT_FA } from "@/lib";
import { jalaliToday, toGregorian, J_WEEKDAYS_LONG, jalaliPartsInTz, J_MONTHS } from "@/lib/jalali";
import { faNum } from "@/lib/fa";
import { cn } from "@/lib";

interface Meal {
  id: string; date: string; slot: string; title: string; note: string | null;
  ingredients: { name: string; qty?: string }[] | null;
}

function isoOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function MealsClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = jalaliToday();
  const [weekOffset, setWeekOffset] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [slot, setSlot] = useState("LUNCH");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [dayIso, setDayIso] = useState(isoOf(new Date()));

  // build this week's 7 days (Sat..Fri) from today's week start
  const weekDays = useMemo(() => {
    const now = new Date();
    const dow = now.getDay(); // 0 Sun .. 6 Sat
    const daysToSat = (dow + 1) % 7; // days since Saturday
    const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToSat + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + i);
      return { iso: isoOf(d), date: d };
    });
  }, [weekOffset]);

  const from = weekDays[0].iso;
  const to = weekDays[6].iso;

  const mealsQuery = useQuery({
    queryKey: ["meals", from, to],
    queryFn: () => api<{ items: Meal[] }>(`/api/meals?from=${from}&to=${to}`),
  });

  const mealsByDaySlot = useMemo(() => {
    const map = new Map<string, Meal>();
    for (const m of mealsQuery.data?.items ?? []) {
      map.set(`${isoOf(new Date(m.date))}:${m.slot}`, m);
    }
    return map;
  }, [mealsQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["meals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const ingList = ingredients
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^(.+?)(?:\s+×\s*(.+))?$/);
          return { name: m?.[1]?.trim() ?? s, qty: m?.[2]?.trim() };
        });
      return api("/api/meals", {
        method: "POST",
        json: {
          date: dayIso,
          slot,
          title: title.trim(),
          note: note.trim() || undefined,
          ingredients: ingList.length ? ingList : undefined,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.push("برنامه غذایی ذخیره شد", "success");
      setModalOpen(false);
      setTitle(""); setNote(""); setIngredients("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const toShopMutation = useMutation({
    mutationFn: (id: string) => api<{ added: number; message?: string }>(`/api/meals/${id}/to-shopping`, { method: "POST", json: {} }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      toast.push(res.message ?? `${faNum(String(res.added))} قلم به لیست خرید اضافه شد`, "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  function openFor(iso: string, s: string) {
    setDayIso(iso);
    setSlot(s);
    const existing = mealsByDaySlot.get(`${iso}:${s}`);
    setTitle(existing?.title ?? "");
    setNote(existing?.note ?? "");
    setIngredients((existing?.ingredients ?? []).map((i) => i.qty ? `${i.name} ×${i.qty}` : i.name).join("\n"));
    setModalOpen(true);
  }

  const todayIso = isoOf(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">برنامه غذایی</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:bg-paper-soft" aria-label="هفته قبل">›</button>
          <span className="px-2 text-[12px] font-bold">{weekOffset === 0 ? "این هفته" : weekOffset > 0 ? `${faNum(weekOffset)} هفته بعد` : `${faNum(-weekOffset)} هفته قبل`}</span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:bg-paper-soft" aria-label="هفته بعد">‹</button>
        </div>
      </div>

      {mealsQuery.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-20" />)}</div>
      ) : mealsQuery.isError ? (
        <EmptyState title="بارگذاری نشد" description="دوباره تلاش کنید." action={<Button size="sm" variant="secondary" onClick={() => mealsQuery.refetch()}>تلاش دوباره</Button>} />
      ) : (
        <div className="space-y-3">
          {weekDays.map(({ iso, date }) => {
            const p = jalaliPartsInTz(date);
            const isToday = iso === todayIso;
            return (
              <Card key={iso} className={cn("overflow-hidden", isToday && "ring-1 ring-ink")}>
                <div className="flex items-center justify-between border-b border-line bg-paper-soft px-4 py-2">
                  <div className="text-[12px] font-bold">
                    {J_WEEKDAYS_LONG[date.getDay()]} {faNum(p.jd)} {J_MONTHS[p.jm - 1]}
                    {isToday && <span className="mr-2 badge badge-black">امروز</span>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-px bg-line">
                  {MEAL_SLOTS.map((s) => {
                    const meal = mealsByDaySlot.get(`${iso}:${s}`);
                    return (
                      <button
                        key={s}
                        onClick={() => openFor(iso, s)}
                        className="flex min-h-16 flex-col items-center justify-center gap-1 bg-white p-2 text-center transition-colors hover:bg-paper-soft"
                        aria-label={`${MEAL_SLOT_FA[s]} — ${meal?.title ?? "خالی"}`}
                      >
                        <span className="text-[10px] text-ink-faint">{MEAL_SLOT_FA[s]}</span>
                        <span className={cn("text-[11px] leading-4", meal ? "font-bold" : "text-ink-faint")}>
                          {meal ? meal.title : "＋"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {MEAL_SLOTS.some((s) => mealsByDaySlot.get(`${iso}:${s}`)) && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] text-ink-faint">مواد لازم را به لیست خرید اضافه کنید</span>
                    <div className="flex gap-1">
                      {MEAL_SLOTS.filter((s) => mealsByDaySlot.get(`${iso}:${s}`)).map((s) => {
                        const meal = mealsByDaySlot.get(`${iso}:${s}`)!;
                        return (
                          <Button
                            key={s}
                            size="sm"
                            variant="secondary"
                            loading={toShopMutation.isPending && toShopMutation.variables === meal.id}
                            onClick={() => toShopMutation.mutate(meal.id)}
                          >
                            🛒 {MEAL_SLOT_FA[s]}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${MEAL_SLOT_FA[slot]} — ${(() => {
          const p = jalaliPartsInTz(new Date(dayIso + "T12:00:00+03:30"));
          return `${faNum(p.jd)} ${J_MONTHS[p.jm - 1]}`;
        })()}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={saveMutation.isPending} disabled={!title.trim()} onClick={() => saveMutation.mutate()}>ذخیره</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">وعده</label>
              <Select value={slot} onChange={setSlot} options={MEAL_SLOTS.map((s) => ({ value: s, label: MEAL_SLOT_FA[s] }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">نام غذا</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="مثلاً زرشک‌پلو" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">مواد اولیه (هر خط یک مورد — قابل افزودن به لیست خرید)</label>
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={4}
              dir="rtl"
              className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft"
              placeholder={"برنج ×۲ کیلو\nمرغ\nزرشک"}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-soft">یادداشت (اختیاری)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
