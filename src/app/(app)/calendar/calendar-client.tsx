"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TimePicker, JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { ChevronRight, ChevronLeft } from "@/components/ui/icon";
import { Card, CardHeader, CardBody, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import {
  EVENT_KINDS, EVENT_KIND_FA, EVENT_KIND_EMOJI, REMINDERS, REMINDER_FA,
  IMPORTANT_KINDS, IMPORTANT_KIND_FA,
} from "@/lib";
import {formatJalali, 
  jalaliToday, jMonthGrid, toGregorian, J_MONTHS, jalaliPartsInTz,
} from "@/lib/jalali";
import { faStr, faNum } from "@/lib/fa";
import { cn } from "@/lib";

interface Ev {
  id: string; title: string; description: string | null; date: string;
  startTime: string | null; endTime: string | null; location: string | null;
  kind: string; reminder: string | null; recurrence: string;
}

interface ImpDate {
  id: string; title: string; kind: string; date: string; repeatsYearly: boolean; note: string | null;
}

function isoOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const CYCLE_PHASE_FA: Record<string, string> = {
  PERIOD: "دوران قاعدگی",
  FOLLICULAR: "پس از قاعدگی",
  OVULATION_WINDOW: "پنجره تخمک‌گذاری",
  LUTEAL: "قبل از قاعدگی",
  UNKNOWN: "نامشخص",
};

export function CalendarClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"month" | "important">("month");

  const today = jalaliToday();
  const [view, setView] = useState({ jy: today.jy, jm: today.jm });
  const [selected, setSelected] = useState<string>(isoOf(new Date()));

  const [evModal, setEvModal] = useState(false);
  const [editing, setEditing] = useState<Ev | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("SHARED");
  const [dateIso, setDateIso] = useState(isoOf(new Date()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState("NONE");
  const [recurrence, setRecurrence] = useState("NONE");

  const [impModal, setImpModal] = useState(false);
  const [impTitle, setImpTitle] = useState("");
  const [impKind, setImpKind] = useState("BIRTHDAY");
  const [impDate, setImpDate] = useState(isoOf(new Date()));

  // ── cycle (menstrual) tracking — shared, both partners see it ──
  const [cycleModal, setCycleModal] = useState(false);
  const [cycleStart, setCycleStart] = useState(isoOf(new Date()));
  const [cycleEnd, setCycleEnd] = useState<string | null>(null);

  interface CycleData {
    periods: { id: string; start: string; end: string | null; note: string | null }[];
    stats: { cycleLen: number; periodLen: number };
    prediction: {
      nextStart: string | null;
      daysUntilNext: number | null;
      phase: "PERIOD" | "FOLLICULAR" | "OVULATION_WINDOW" | "LUTEAL" | "UNKNOWN";
      dayOfCycle: number | null;
    };
    pmsDays?: string[];
    forecasts?: string[];
    lastVariance?: { daysLate: number; lengthDiff: number } | null;
    report?: { id: string; start: string; end: string; len: number; gap: number | null; daysLate: number | null }[];
  }

  const [cycleReportOpen, setCycleReportOpen] = useState(false);

  const cycleQuery = useQuery({
    queryKey: ["cycle"],
    queryFn: () => api<CycleData>("/api/cycle"),
  });

  const logCycleMutation = useMutation({
    mutationFn: () => api("/api/cycle", {
      method: "POST",
      json: { start: cycleStart, end: cycleEnd || null },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle"] });
      toast.push("دوران ثبت شد 🌸", "success");
      setCycleModal(false);
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const endCycleMutation = useMutation({
    mutationFn: (id: string) => api("/api/cycle", { method: "PATCH", json: { id, end: isoOf(new Date()) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle"] });
      toast.push("پایان ثبت شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteCycleMutation = useMutation({
    mutationFn: (id: string) => api(`/api/cycle?id=${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cycle"] }),
  });

  const monthStart = useMemo(() => {
    const g = toGregorian(view.jy, view.jm, 1);
    return isoOf(g);
  }, [view]);
  const monthEnd = useMemo(() => {
    const grid = jMonthGrid(view.jy, view.jm);
    const last = [...grid].reverse().find((c) => c !== null)!;
    return isoOf(toGregorian(last.jy, last.jm, last.jd));
  }, [view]);

  const eventsQuery = useQuery({
    queryKey: ["events", monthStart, monthEnd],
    queryFn: () => api<{ items: Ev[] }>(`/api/events?from=${monthStart}&to=${monthEnd}`),
  });

  // cycle day sets for marking
  const periodDaySet = useMemo(() => {
    const set = new Set<string>();
    const todayStr = isoOf(new Date());
    for (const p of cycleQuery.data?.periods ?? []) {
      const s = p.start;
      // closed → start..end; ongoing & started → start..today; ongoing & pre-logged (future start) → start..start+periodLen-1
      let e: string;
      if (p.end) e = p.end;
      else if (s <= todayStr) e = todayStr;
      else e = p.start; // future-logged open period — mark its expected length
      let d = new Date(s + "T00:00:00Z");
      const end = new Date(e + "T00:00:00Z");
      while (d <= end) {
        set.add(d.toISOString().slice(0, 10));
        d = new Date(d.getTime() + 86_400_000);
      }
    }
    return set;
  }, [cycleQuery.data]);

  const predictedDaySet = useMemo(() => {
    const set = new Set<string>();
    const len = cycleQuery.data?.stats.periodLen ?? 5;
    // all forecasted starts (up to 3 cycles ahead → covers following months)
    for (const next of cycleQuery.data?.forecasts ?? []) {
      let d = new Date(next + "T00:00:00Z");
      for (let i = 0; i < len; i++) {
        set.add(d.toISOString().slice(0, 10));
        d = new Date(d.getTime() + 86_400_000);
      }
    }
    return set;
  }, [cycleQuery.data]);

  // PMS days (computed): the ~4 days before each forecast start
  const pmsDaySet = useMemo(() => {
    const set = new Set<string>();
    for (const d of cycleQuery.data?.pmsDays ?? []) set.add(d);
    return set;
  }, [cycleQuery.data]);

  const importantQuery = useQuery({
    queryKey: ["important-dates"],
    queryFn: () => api<{ items: ImpDate[] }>("/api/important-dates"),
    enabled: tab === "important",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["important-dates"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saveEvMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        kind,
        date: dateIso,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        location: location.trim() || undefined,
        reminder: reminder === "NONE" ? undefined : reminder,
        recurrence,
      };
      if (editing) return api(`/api/events/${editing.id}`, { method: "PATCH", json: payload });
      return api("/api/events", { method: "POST", json: payload });
    },
    onSuccess: () => {
      invalidate();
      toast.push(editing ? "رویداد ویرایش شد" : "رویداد ثبت شد", "success");
      setEvModal(false);
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const deleteEvMutation = useMutation({
    mutationFn: (id: string) => api(`/api/events/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const saveImpMutation = useMutation({
    mutationFn: () => api("/api/important-dates", {
      method: "POST",
      json: { title: impTitle.trim(), kind: impKind, date: impDate },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("مناسبت ثبت شد", "success");
      setImpModal(false);
      setImpTitle("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  async function askDeleteEv(e: Ev) {
    const yes = await confirm({
      title: "حذف رویداد",
      body: `«${e.title}» حذف شود؟`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (yes) deleteEvMutation.mutate(e.id);
  }

  // month events by iso date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of eventsQuery.data?.items ?? []) {
      const iso = isoOf(new Date(e.date));
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(e);
    }
    return map;
  }, [eventsQuery.data]);

  const grid = jMonthGrid(view.jy, view.jm);
  const todayIso = isoOf(new Date());
  const selectedEvents = eventsByDate.get(selected) ?? [];

  function openCreate(iso?: string) {
    setEditing(null);
    setTitle(""); setKind("SHARED"); setStartTime(""); setEndTime(""); setLocation(""); setReminder("NONE"); setRecurrence("NONE");
    setDateIso(iso ?? selected);
    setEvModal(true);
  }

  function openEdit(e: Ev) {
    setEditing(e);
    setTitle(e.title); setKind(e.kind);
    setDateIso(isoOf(new Date(e.date)));
    setStartTime(e.startTime ?? ""); setEndTime(e.endTime ?? "");
    setLocation(e.location ?? ""); setReminder(e.reminder ?? "NONE"); setRecurrence(e.recurrence);
    setEvModal(true);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      if (jm > 12) { jm = 1; jy += 1; }
      if (jm < 1) { jm = 12; jy -= 1; }
      return { jy, jm };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">تقویم مشترک</h1>
        <div className="flex gap-2">
          {tab === "important" && <Button size="sm" variant="secondary" onClick={() => setImpModal(true)}>+ مناسبت</Button>}
          <Button size="sm" onClick={() => openCreate()}>+ رویداد</Button>
        </div>
      </div>

      {/* ── cycle status card (shared — both partners see) ── */}
      {cycleQuery.isLoading ? null : (() => {
        const pred = cycleQuery.data?.prediction;
        const stats = cycleQuery.data?.stats;
        const openPeriod = (cycleQuery.data?.periods ?? []).find((p) => !p.end);
        const cycleLen = stats?.cycleLen ?? 28;
        const dayOfCycle = pred?.dayOfCycle ?? null;
        const pct = dayOfCycle ? Math.min(100, Math.round((dayOfCycle / cycleLen) * 100)) : 0;

        const PHASE_FA_FULL: Record<string, { title: string; emoji: string; hint: string; cls: string }> = {
          PERIOD: { title: "دوران قاعدگی", emoji: "🌸", hint: "مراقب همسر باشید — درد و خستگی طبیعی است", cls: "text-rose-700" },
          FOLLICULAR: { title: "بعد از قاعدگی", emoji: "🌿", hint: "انرژی معمولا بالاست — وقت خوبی برای قرارها", cls: "text-emerald-700" },
          OVULATION_WINDOW: { title: "پنجره تخمک‌گذاری", emoji: "🥚", hint: "میانه چرخه — پرانرژی‌ترین زمان", cls: "text-sky-700" },
          LUTEAL: { title: "قبل از قاعدگی (لوتئال)", emoji: "🌙", hint: "ممکن است حال‌وهوا تغییر کند — PMS طبیعی است", cls: "text-amber-700" },
          UNKNOWN: { title: "نامشخص", emoji: "🌸", hint: "اولین روز قاعدگی را ثبت کنید", cls: "text-ink-soft" },
        };
        const ph = pred?.phase ? PHASE_FA_FULL[pred.phase] : PHASE_FA_FULL.UNKNOWN;

        return (
          <Card className="border-rose-200 bg-gradient-to-b from-rose-50/80 to-white">
            <CardBody className="space-y-3">
              {/* header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[18px]" aria-hidden>🌸</span>
                  <div>
                    <div className="text-[13px] font-bold text-rose-900">چرخه قاعدگی</div>
                    <div className="text-[11px] text-rose-700">{stats ? `چرخه ${faNum(cycleLen)} روزه · دوره ${faNum(stats.periodLen)} روزه` : "هنوز داده‌ای نیست"}</div>
                  </div>
                </div>
                {openPeriod ? (
                  <Button size="sm" variant="secondary" loading={endCycleMutation.isPending} onClick={() => endCycleMutation.mutate(openPeriod.id)}>
                    پایان یافت
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => { setCycleStart(selected); setCycleEnd(null); setCycleModal(true); }}>
                    + ثبت دوره
                  </Button>
                )}
              </div>

              {/* today's status — big & clear */}
              {(cycleQuery.data?.periods?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-rose-300 bg-white/70 px-3.5 py-3 text-center text-[11.5px] leading-5 text-ink-faint">
                  اولین روز قاعدگی را با «+ ثبت دوره» وارد کنید — پیش‌بینی و روزهای PMS خودکار محاسبه می‌شوند.
                </div>
              ) : dayOfCycle ? (
                <div className="flex items-center gap-3.5 rounded-xl bg-white/80 px-3.5 py-3">
                  <div className="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center">
                    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
                      <circle cx="20" cy="20" r="16.5" fill="none" stroke="currentColor" className="text-rose-100" strokeWidth="4.5" />
                      <circle
                        cx="20" cy="20" r="16.5" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
                        className={pred?.phase === "PERIOD" ? "text-rose-500" : pred?.phase === "LUTEAL" ? "text-amber-500" : "text-emerald-500"}
                        strokeDasharray={`${(pct / 100) * 103.7} 103.7`}
                      />
                    </svg>
                    <div className="text-center leading-tight">
                      <div className="text-[17px] font-black text-ink">{faNum(dayOfCycle)}</div>
                      <div className="text-[8.5px] text-ink-faint">روز چرخه</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={cn("text-[13.5px] font-black", ph.cls)}>{ph.emoji} {ph.title}</div>
                    <div className="mt-1 text-[11.5px] leading-5 text-ink-soft">{ph.hint}</div>
                    {pred?.daysUntilNext !== null && pred?.daysUntilNext !== undefined && pred.daysUntilNext > 0 && (
                      <div className="mt-1 text-[11.5px] font-bold text-rose-700">
                        {pred.daysUntilNext === 1 ? "شروع بعدی: فردا" : `شروع بعدی: ${faNum(pred.daysUntilNext)} روز دیگر`}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-white/80 px-3.5 py-3">
                  <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full bg-amber-50">
                    <span className="text-[26px]" aria-hidden>⏳</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-black text-amber-700">🌙 قبل از قاعدگی (لوتئال)</div>
                    <div className="mt-1 text-[11.5px] leading-5 text-ink-soft">دوره‌ی بعدی ثبت شده — تا شروع:</div>
                    {pred?.daysUntilNext !== null && pred?.daysUntilNext !== undefined && pred.daysUntilNext > 0 && (
                      <div className="mt-0.5 text-[13px] font-black text-rose-700">{faNum(pred.daysUntilNext)} روز تا شروع دوره</div>
                    )}
                  </div>
                </div>
              )}

              {/* ongoing period banner */}
              {openPeriod && (
                <div className="rounded-lg bg-rose-100/80 px-3 py-2 text-[12px] font-bold text-rose-800">
                  {openPeriod.start <= isoOf(new Date())
                    ? <>🌸 دوره از {formatJalali(new Date(openPeriod.start + "T12:00:00+03:30"))} شروع شده و ادامه دارد</>
                    : <>🌸 دوره برای {formatJalali(new Date(openPeriod.start + "T12:00:00+03:30"))} ثبت شده — وقتی رسید روزهایش روی تقویم مشخص می‌شود</>}
                </div>
              )}

              {(() => {
                const v = cycleQuery.data?.lastVariance;
                if (!v || (v.daysLate === 0 && v.lengthDiff === 0)) return null;
                const parts: string[] = [];
                if (v.daysLate > 0) parts.push(`${faNum(v.daysLate)} روز دیرتر از پیش‌بینی شروع شد`);
                else if (v.daysLate < 0) parts.push(`${faNum(Math.abs(v.daysLate))} روز زودتر از پیش‌بینی شروع شد`);
                else parts.push("سر وقت شروع شد");
                if (v.lengthDiff > 0) parts.push(`${faNum(v.lengthDiff)} روز طولانی‌تر`);
                else if (v.lengthDiff < 0) parts.push(`${faNum(Math.abs(v.lengthDiff))} روز کوتاه‌تر`);
                return (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-5 text-amber-800">
                    ⏱ دوره اخیر: {parts.join(" و ")}
                  </div>
                );
              })()}

              {(cycleQuery.data?.report?.length ?? 0) > 0 && (
                <button
                  onClick={() => setCycleReportOpen(true)}
                  className="text-[11px] font-medium text-rose-700 underline underline-offset-4"
                >
                  گزارش چرخه‌ها ({faNum(cycleQuery.data!.report!.length)} دوره)
                </button>
              )}
            </CardBody>
          </Card>
        );
      })()}

      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { id: "month", label: "ماه" },
          { id: "important", label: "مناسبت‌ها" },
        ]}
      />

      {tab === "month" && (
        <>
          {/* month header + today button */}
          <div className="flex items-center justify-between">
            <button onClick={() => shiftMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:bg-paper-soft" aria-label="ماه قبل"><ChevronRight className="h-4 w-4" /></button>
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-black">{J_MONTHS[view.jm - 1]} {faNum(view.jy)}</div>
              {(view.jy !== today.jy || view.jm !== today.jm) && (
                <button
                  onClick={() => { setView({ jy: today.jy, jm: today.jm }); setSelected(isoOf(new Date())); }}
                  className="flex h-7 items-center rounded-full bg-ink px-2.5 text-[10.5px] font-bold text-white"
                  aria-label="رفتن به امروز"
                >
                  امروز
                </button>
              )}
            </div>
            <button onClick={() => shiftMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:bg-paper-soft" aria-label="ماه بعد"><ChevronLeft className="h-4 w-4" /></button>
          </div>

          {eventsQuery.isLoading ? (
            <SkeletonBlock className="h-72 w-full" />
          ) : (
            <>
              {/* weekday header */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-faint">
                {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              {/* grid */}
              <div className="grid grid-cols-7 gap-1">
                {grid.map((cell, i) => {
                  if (!cell) return <div key={i} className="aspect-square" />;
                  const iso = isoOf(toGregorian(cell.jy, cell.jm, cell.jd));
                  const dayEvents = eventsByDate.get(iso) ?? [];
                  const isToday = iso === todayIso;
                  const isSelected = iso === selected;
                  const isPeriodDay = periodDaySet.has(iso);
                  const isPredictedDay = predictedDaySet.has(iso);
                  const isPmsDay = !isPeriodDay && !isPredictedDay && pmsDaySet.has(iso);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelected(iso)}
                      onDoubleClick={() => openCreate(iso)}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[12px] transition-colors",
                        isSelected ? "border-ink bg-paper-soft font-bold" : "border-transparent hover:bg-white",
                        isToday && "ring-1 ring-ink",
                        isPeriodDay && "bg-rose-200/80",
                        isPredictedDay && "border-2 border-dashed border-rose-400",
                        isPmsDay && "border-dashed border-amber-400 bg-amber-50",
                      )}
                      aria-label={`${cell.jd} ${J_MONTHS[cell.jm - 1]}${isPeriodDay ? " — دوران قاعدگی" : isPredictedDay ? " — پیش‌بینی دوره" : isPmsDay ? " — احتمال PMS" : ""}`}
                      aria-pressed={isSelected}
                    >
                      <span className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full",
                        isToday ? "bg-ink text-white" : isPeriodDay ? "text-rose-700" : "",
                      )}>{faNum(cell.jd)}</span>
                      {dayEvents.length > 0 && (
                        <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                          {dayEvents.slice(0, 3).map((e) => (
                            <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-ink" />
                          ))}
                        </span>
                      )}
                      {isPeriodDay && <span className="absolute top-1 right-1 text-[8px]" aria-hidden>🌸</span>}
                      {isPredictedDay && !isPeriodDay && <span className="absolute bottom-1 left-1 text-[7px] text-rose-500" aria-hidden>پیش‌بینی</span>}
                    </button>
                  );
                })}
              </div>

              {/* legend — real vs forecast at a glance */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10.5px] text-ink-faint">
                <span className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-md bg-rose-200/80 text-[8px]" aria-hidden>🌸</span>
                  روز قاعدگی (ثبت‌شده)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-md border-2 border-dashed border-rose-400" aria-hidden></span>
                  پیش‌بینی دوره بعد
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-md border border-dashed border-amber-400 bg-amber-50" aria-hidden></span>
                  احتمال PMS (قبل از دوره)
                </span>
              </div>

              {/* selected day events */}
              <Card>
                <CardHeader
                  title={(() => {
                    const p = jalaliPartsInTz(new Date(selected + "T12:00:00+03:30"));
                    return `${faNum(p.jd)} ${J_MONTHS[p.jm - 1]}`;
                  })()}
                  action={<Button size="sm" variant="ghost" onClick={() => openCreate(selected)}>+ افزودن</Button>}
                />
                <CardBody className="space-y-2">
                  {selectedEvents.length === 0 ? (
                    <EmptyState
                      icon={<span aria-hidden>📅</span>}
                      title="رویدادی در این روز نیست"
                      description="برای افزودن، دکمه بالا یا دابل‌کلیک روی روز را بزنید."
                      compact
                    />
                  ) : (
                    selectedEvents.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                        <span className="text-[18px]" aria-hidden>{EVENT_KIND_EMOJI[e.kind]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold">{e.title}</div>
                          <div className="text-[11px] text-ink-faint">
                            {EVENT_KIND_FA[e.kind]}
                            {e.startTime ? ` · ${faStr(e.startTime)}${e.endTime ? ` تا ${faStr(e.endTime)}` : ""}` : ""}
                            {e.location ? ` · ${e.location}` : ""}
                            {e.recurrence !== "NONE" ? " · تکرارشونده" : ""}
                            {e.reminder && e.reminder !== "NONE" ? ` · ${REMINDER_FA[e.reminder]}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => openEdit(e)} className="rounded p-1 text-ink-faint hover:bg-paper-soft hover:text-ink" aria-label="ویرایش">✏️</button>
                          <button onClick={() => askDeleteEv(e)} className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="حذف">🗑️</button>
                        </div>
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {tab === "important" && (
        <div className="space-y-2">
          {importantQuery.isLoading ? (
            <div className="space-y-2"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
          ) : (importantQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<span aria-hidden>🎂</span>}
              title="مناسبتی ثبت نشده"
              description="تولدها و سالگردها را اضافه کنید تا یادآوری‌شان را ببینید."
              action={<Button size="sm" onClick={() => setImpModal(true)}>+ مناسبت</Button>}
            />
          ) : (
            importantQuery.data!.items.map((d) => {
              const p = jalaliPartsInTz(new Date(d.date));
              return (
                <Card key={d.id} className="flex items-center gap-3 p-3">
                  <span className="text-[20px]" aria-hidden>{d.kind === "BIRTHDAY" ? "🎂" : d.kind === "WEDDING" ? "💍" : d.kind === "ANNIVERSARY" ? "💞" : "📌"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{d.title}</div>
                    <div className="text-[11px] text-ink-faint">
                      {IMPORTANT_KIND_FA[d.kind]} · {faNum(p.jd)} {J_MONTHS[p.jm - 1]}
                      {d.repeatsYearly ? " · هر سال" : ""}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* event modal */}
      <Modal
        open={evModal}
        onClose={() => setEvModal(false)}
        title={editing ? "ویرایش رویداد" : "رویداد جدید"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEvModal(false)}>انصراف</Button>
            <Button loading={saveEvMutation.isPending} disabled={!title.trim()} onClick={() => saveEvMutation.mutate()}>ذخیره</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="مثلاً شام خارج از خانه" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="kind" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نوع</label>
              <Select value={kind} onChange={setKind} options={EVENT_KINDS.map((k) => ({ value: k, label: `${EVENT_KIND_EMOJI[k]} ${EVENT_KIND_FA[k]}` }))} />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ</label>
              <div className="text-[13px]">{(() => {
                const p = jalaliPartsInTz(new Date(dateIso + "T12:00:00+03:30"));
                return `${faNum(p.jd)} ${J_MONTHS[p.jm - 1]} ${faNum(p.jy)}`;
              })()}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="شروع" className="mb-1.5 block text-[12px] font-medium text-ink-soft">شروع</label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <label htmlFor="پایان" className="mb-1.5 block text-[12px] font-medium text-ink-soft">پایان</label>
              <TimePicker value={endTime} onChange={setEndTime} />
            </div>
            <div>
              <label htmlFor="یادآور" className="mb-1.5 block text-[12px] font-medium text-ink-soft">یادآور</label>
              <Select value={reminder} onChange={setReminder} options={REMINDERS.map((r) => ({ value: r, label: REMINDER_FA[r] }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="location" className="mb-1.5 block text-[12px] font-medium text-ink-soft">مکان (اختیاری)</label>
              <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="مثلاً کافه جام" />
            </div>
            <div>
              <label htmlFor="recurrence" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تکرار</label>
              <Select value={recurrence} onChange={setRecurrence} options={[
                { value: "NONE", label: "بدون تکرار" },
                { value: "DAILY", label: "روزانه" },
                { value: "WEEKLY", label: "هفتگی" },
                { value: "MONTHLY", label: "ماهانه" },
              ]} />
            </div>
          </div>
        </div>
      </Modal>

      {/* important date modal */}
      <Modal
        open={impModal}
        onClose={() => setImpModal(false)}
        title="مناسبت جدید"
        footer={
          <>
            <Button variant="outline" onClick={() => setImpModal(false)}>انصراف</Button>
            <Button loading={saveImpMutation.isPending} disabled={!impTitle.trim()} onClick={() => saveImpMutation.mutate()}>ثبت</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-[12px] font-medium text-ink-soft">عنوان</label>
            <input id="title" value={impTitle} onChange={(e) => setImpTitle(e.target.value)} className="h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft" placeholder="مثلاً تولد سارا" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="kind" className="mb-1.5 block text-[12px] font-medium text-ink-soft">نوع</label>
              <Select value={impKind} onChange={setImpKind} options={IMPORTANT_KINDS.map((k) => ({ value: k, label: IMPORTANT_KIND_FA[k] }))} />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ</label>
              <div className="pt-2 text-[13px]">{(() => {
                const p = jalaliPartsInTz(new Date(impDate + "T12:00:00+03:30"));
                return `${faNum(p.jd)} ${J_MONTHS[p.jm - 1]} ${faNum(p.jy)}`;
              })()}</div>
            </div>
          </div>
          <input id="date" type="date" value={impDate} onChange={(e) => setImpDate(e.target.value)} className="hidden" aria-hidden />
        </div>
      </Modal>

      {/* ── cycle report modal ── */}
      <Modal
        open={cycleReportOpen}
        onClose={() => setCycleReportOpen(false)}
        title="گزارش دوران قاعدگی"
        footer={<Button variant="outline" onClick={() => setCycleReportOpen(false)}>بستن</Button>}
      >
        <div className="space-y-3">
          {(cycleQuery.data?.stats) && (
            <div className="rounded-lg bg-paper-soft px-3 py-2 text-[12px] leading-6">
              میانگین چرخه: <b>{faNum(cycleQuery.data.stats.cycleLen)} روز</b> · میانگین طول دوره: <b>{faNum(cycleQuery.data.stats.periodLen)} روز</b>
            </div>
          )}
          {(() => {
            const all = cycleQuery.data?.report ?? [];
            const todayIso = isoOf(new Date());
            const past = all.filter((r) => r.start <= todayIso);
            const future = all.filter((r) => r.start > todayIso);

            return (
              <>
                {/* ── actual periods (happened) ── */}
                <div className="text-[12px] font-black text-ink">دوره‌های ثبت‌شده ({faNum(past.length)})</div>
                {past.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11px] text-ink-faint">
                    هنوز دوره‌ای ثبت نشده است
                  </div>
                ) : past.slice().reverse().map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                    <div>
                      <div className="text-[12px] font-bold">🌸 {formatJalali(new Date(r.start + "T12:00:00+03:30"))}</div>
                      <div className="mt-0.5 text-[11px] text-ink-faint">
                        {r.end ? `تا ${formatJalali(new Date(r.end + "T12:00:00+03:30"))}` : "در جریان"} · {faNum(r.len)} روز
                      </div>
                    </div>
                    <div className="text-left text-[11px]">
                      {r.gap != null && <div className="text-ink-soft">فاصله با قبل: {faNum(r.gap)} روز</div>}
                      {r.daysLate != null && r.daysLate !== 0 && (
                        <div className={r.daysLate > 0 ? "text-amber-700" : "text-emerald-700"}>
                          {r.daysLate > 0 ? `${faNum(r.daysLate)} روز دیرتر از پیش‌بینی` : `${faNum(Math.abs(r.daysLate))} روز زودتر`}
                        </div>
                      )}
                      {r.daysLate === 0 && <div className="text-emerald-700">سر وقت</div>}
                      <button
                        onClick={() => deleteCycleMutation.mutate(r.id)}
                        className="mt-1 text-ink-faint hover:text-red-600"
                        aria-label="حذف دوره"
                      >🗑️</button>
                    </div>
                  </div>
                ))}

                {/* ── future "periods" — these are actually forecasts saved as records ── */}
                {future.length > 0 && (
                  <>
                    <div className="pt-2 text-[12px] font-black text-ink">از تاریخ به بعد ({faNum(future.length)})</div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] leading-5 text-amber-800">
                      ⚠️ این‌ها با تاریخ آینده ثبت شده‌اند و پیش‌بینی محسوب می‌شوند، نه دوره‌ی واقعی.
                      اگر اشتباه ثبت شده‌اند حذفشان کنید و فقط دوره‌ی رخ‌داده را ثبت کنید.
                    </div>
                    {future.slice().reverse().map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2">
                        <div>
                          <div className="text-[12px] font-bold">{formatJalali(new Date(r.start + "T12:00:00+03:30"))}</div>
                          <div className="mt-0.5 text-[11px] text-ink-faint">
                            {r.end ? `تا ${formatJalali(new Date(r.end + "T12:00:00+03:30"))}` : "بدون پایان"} · {faNum(r.len)} روز
                          </div>
                        </div>
                        <button
                          onClick={() => deleteCycleMutation.mutate(r.id)}
                          className="text-ink-faint hover:text-red-600"
                          aria-label="حذف دوره آینده"
                        >🗑️</button>
                      </div>
                    ))}
                  </>
                )}

                {/* ── upcoming forecasts (computed, not records) ── */}
                {(cycleQuery.data?.forecasts?.length ?? 0) > 0 && cycleQuery.data?.forecasts && cycleQuery.data.stats && (
                  <>
                    <div className="pt-2 text-[12px] font-black text-ink">پیش‌بینی دوره‌های بعدی</div>
                    {cycleQuery.data.forecasts.map((f, i) => {
                      const first = new Date(f + "T12:00:00+03:30");
                      const last = new Date(first.getTime() + ((cycleQuery.data.stats.periodLen ?? 5) - 1) * 86_400_000);
                      return (
                        <div key={f} className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-rose-300 px-3 py-2">
                          <div>
                            <div className="text-[12px] font-bold">دوره‌ی {faNum(i + 1)}م بعدی</div>
                            <div className="mt-0.5 text-[11px] text-ink-faint">
                              ~ {formatJalali(first)} تا {formatJalali(last)}
                            </div>
                          </div>
                          <span className="badge badge-gray text-[10px]">پیش‌بینی</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </Modal>

      {/* ── cycle log modal ── */}
      <Modal
        open={cycleModal}
        onClose={() => setCycleModal(false)}
        title="ثبت دوران قاعدگی"
        footer={
          <>
            <Button variant="outline" onClick={() => setCycleModal(false)}>انصراف</Button>
            <Button loading={logCycleMutation.isPending} onClick={() => logCycleMutation.mutate()}>ثبت</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ شروع</span>
            <JalaliDatePicker value={cycleStart} onChange={setCycleStart} />
          </div>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">تاریخ پایان (خالی بگذارید اگر ادامه دارد)</span>
            <JalaliDatePicker value={cycleEnd ?? ""} onChange={(v) => setCycleEnd(v || null)} />
          </div>
          <p className="text-[11px] leading-5 text-ink-faint">
            پس از چند بار ثبت، طول چرخه و تاریخ بعدی به‌صورت خودکار پیش‌بینی می‌شود و هر دو نفر می‌بینید.
          </p>
        </div>
      </Modal>
    </div>
  );
}
