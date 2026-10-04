"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { MOODS, MOOD_FA, MOOD_EMOJI } from "@/lib";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/fa";
import { cn, isoDateInTz } from "@/lib";

interface MoodRow {
  id: string; date: string; mood: string; note: string | null; visibility: string;
  user: { id: string; fullName: string; avatarEmoji: string | null };
}

interface CheckinRow {
  id: string; date: string; happy: string | null; bothered: string | null; need: string | null; visibility: string;
  user: { id: string; fullName: string; avatarEmoji: string | null };
}

interface MeWithPartner {
  id: string;
  household: { id: string; name: string; partner: { id: string; fullName: string; avatarEmoji: string | null } | null } | null;
}


function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// 14-day mini bar of moods (oldest → newest)
function MoodStrip({ items, label }: { items: MoodRow[]; label: string }) {
  const days = useMemo(() => {
    const byDate = new Map(items.map((m) => [isoDateInTz(new Date(m.date)), m]));
    const out: { iso: string; mood?: string }[] = [];
    const today = new Date(todayIso() + "T12:00:00Z");
    for (let i = 13; i >= 0; i--) {
      const iso = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      out.push({ iso, mood: byDate.get(iso)?.mood });
    }
    return out;
  }, [items]);

  return (
    <div className="flex items-end gap-1" role="img" aria-label={`حال‌وهوای ${label} در ۱۴ روز اخیر`}>
      {days.map((d) => (
        <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={cn(
              "h-8 w-full rounded-sm transition-colors",
              !d.mood && "bg-paper-deep/60",
              d.mood === "GREAT" && "bg-emerald-400",
              d.mood === "GOOD" && "bg-emerald-300",
              d.mood === "NORMAL" && "bg-sky-300",
              d.mood === "SAD" && "bg-amber-300",
              d.mood === "ANGRY" && "bg-rose-400",
            )}
            title={`${d.iso}${d.mood ? ` — ${MOOD_FA[d.mood]}` : " — بدون ثبت"}`}
          />
          {d.mood && <span className="text-[9px]" aria-hidden>{MOOD_EMOJI[d.mood]}</span>}
        </div>
      ))}
    </div>
  );
}

export function RelationshipClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const [tab, setTab] = useState<"mood" | "checkin" | "history">("mood");

  const [mood, setMood] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [happy, setHappy] = useState("");
  const [bothered, setBothered] = useState("");
  const [need, setNeed] = useState("");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeWithPartner>("/api/auth/me"),
  });
  const partner = meQuery.data?.household?.partner ?? null;

  const moodsQuery = useQuery({
    queryKey: ["moods"],
    queryFn: () => api<{ items: MoodRow[] }>("/api/moods"),
  });
  const checkinsQuery = useQuery({
    queryKey: ["checkins"],
    queryFn: () => api<{ items: CheckinRow[] }>("/api/checkins"),
    enabled: tab === "checkin" || tab === "history",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["moods"] });
    qc.invalidateQueries({ queryKey: ["checkins"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const moodMutation = useMutation({
    mutationFn: () => api("/api/moods", {
      method: "POST",
      json: { date: todayIso(), mood, note: moodNote.trim() || undefined, visibility: "SHARED" },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("حال‌وهوای امروز ثبت شد", "success");
      setMoodNote("");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const checkinMutation = useMutation({
    mutationFn: () => api("/api/checkins", {
      method: "POST",
      json: {
        date: todayIso(),
        happy: happy.trim() || undefined,
        bothered: bothered.trim() || undefined,
        need: need.trim() || undefined,
        visibility: "SHARED",
      },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("چک‌این ثبت شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const allMoods = moodsQuery.data?.items ?? [];
  const today = todayIso();
  const myToday = allMoods.find((m) => m.user.id === me?.id && isoDateInTz(new Date(m.date)) === today);
  const partnerToday = partner ? allMoods.find((m) => m.user.id === partner.id && isoDateInTz(new Date(m.date)) === today) : undefined;

  // streak: consecutive days with any mood logged by EITHER partner
  const streak = useMemo(() => {
    const dates = new Set(allMoods.map((m) => isoDateInTz(new Date(m.date))));
    const t = new Date(today + "T12:00:00Z");
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const iso = new Date(t.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      if (dates.has(iso)) count++;
      else if (i === 0) continue; // today not logged yet — keep counting from yesterday
      else break;
    }
    return count;
  }, [allMoods, today]);

  const myMoods = allMoods.filter((m) => m.user.id === me?.id);
  const partnerMoods = partner ? allMoods.filter((m) => m.user.id === partner.id) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">رابطه ما</h1>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            🔥 {faNum(streak)} روز پیوسته
          </span>
        )}
      </div>

      {/* ── today's snapshot: both of you side by side ── */}
      <Card>
        <CardHeader title="وضعیت امروز" subtitle="هر دو نفر، کنار هم" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3">
            <div className={cn("rounded-xl border p-3 text-center", myToday ? "border-line bg-white" : "border-dashed border-line bg-paper-soft/40")}>
              <div className="text-[22px]" aria-hidden>{myToday ? MOOD_EMOJI[myToday.mood] : "🫥"}</div>
              <div className="mt-1 text-[12px] font-bold">من</div>
              <div className="text-[11px] text-ink-faint">{myToday ? MOOD_FA[myToday.mood] : "امروز ثبت نکردم"}</div>
            </div>
            <div className={cn("rounded-xl border p-3 text-center", partnerToday ? "border-line bg-white" : "border-dashed border-line bg-paper-soft/40")}>
              <div className="text-[22px]" aria-hidden>{partnerToday ? MOOD_EMOJI[partnerToday.mood] : "🫥"}</div>
              <div className="mt-1 text-[12px] font-bold">{partner ? partner.fullName : "همسر"}</div>
              <div className="text-[11px] text-ink-faint">{partnerToday ? MOOD_FA[partnerToday.mood] : "امروز ثبت نکرده"}</div>
            </div>
          </div>
          {(myToday?.note || partnerToday?.note) && (
            <div className="mt-3 space-y-1.5">
              {myToday?.note && (
                <div className="rounded-lg bg-paper-soft px-3 py-2 text-[12px] leading-5">
                  <b>من:</b> {myToday.note}
                </div>
              )}
              {partnerToday?.note && (
                <div className="rounded-lg bg-paper-soft px-3 py-2 text-[12px] leading-5">
                  <b>{partner?.fullName}:</b> {partnerToday.note}
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { id: "mood", label: "حال‌وهوا" },
          { id: "checkin", label: "چک‌این روزانه" },
          { id: "history", label: "تاریخچه" },
        ]}
      />

      {tab === "mood" && (
        <>
          <Card>
            <CardHeader
              title="امروز چطوری؟"
              subtitle={myToday ? `امروز ${MOOD_EMOJI[myToday.mood]} ${MOOD_FA[myToday.mood]} ثبت کرده‌اید — دوباره ثبت کنید تا جایگزین شود` : "حال‌وهوای امروزتان را ثبت کنید"}
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="حال‌وهوا">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mood === m || (!mood && myToday?.mood === m)}
                    onClick={() => setMood(m)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-3 transition-transform active:scale-95",
                      mood === m || (!mood && myToday?.mood === m) ? "border-ink bg-paper-soft" : "border-line bg-white hover:bg-paper-soft",
                    )}
                  >
                    <span className="text-[24px]" aria-hidden>{MOOD_EMOJI[m]}</span>
                    <span className="text-[10px]">{MOOD_FA[m]}</span>
                  </button>
                ))}
              </div>
              <textarea
                value={moodNote}
                onChange={(e) => setMoodNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft"
                placeholder="چند کلمه درباره امروز… (اختیاری)"
                aria-label="یادداشت حال‌وهوا"
              />
              <div className="flex items-center justify-end">
                <Button size="sm" loading={moodMutation.isPending} disabled={!mood} onClick={() => moodMutation.mutate()}>
                  ثبت
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* 14-day mood strips — one per person */}
          <Card>
            <CardHeader title="۱۴ روز اخیر" subtitle="نوار رنگی حال‌وهوا" />
            <CardBody className="space-y-4">
              <div>
                <div className="mb-1.5 text-[11px] font-bold text-ink-soft">من</div>
                <MoodStrip items={myMoods} label="من" />
              </div>
              {partner && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-ink-soft">{partner.fullName}</div>
                  <MoodStrip items={partnerMoods} label={partner.fullName} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-faint">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> عالی</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-300" /> خوب</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> معمولی</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-300" /> ناراحت</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> عصبانی</span>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {tab === "checkin" && (
        <Card>
          <CardHeader title="چک‌این امروز" subtitle="سه سؤال کوتاه برای قلب‌به‌قلب بودن" />
          <CardBody className="space-y-3">
            <div>
              <label htmlFor="checkin-happy" className="mb-1.5 block text-[12px] font-medium text-ink-soft">😊 چه چیزی امروز خوشحالت کرد؟</label>
              <textarea id="checkin-happy" value={happy} onChange={(e) => setHappy(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div>
              <label htmlFor="checkin-bothered" className="mb-1.5 block text-[12px] font-medium text-ink-soft">😕 چه چیزی اذیتت کرد؟</label>
              <textarea id="checkin-bothered" value={bothered} onChange={(e) => setBothered(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div>
              <label htmlFor="checkin-need" className="mb-1.5 block text-[12px] font-medium text-ink-soft">🤝 امروز چه چیزی از همسرت نیاز داری؟</label>
              <textarea id="checkin-need" value={need} onChange={(e) => setNeed(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                loading={checkinMutation.isPending}
                disabled={!happy.trim() && !bothered.trim() && !need.trim()}
                onClick={() => checkinMutation.mutate()}
              >
                ثبت چک‌این
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardHeader title="تاریخچه" subtitle="همه‌ی حال‌وهواها و چک‌این‌ها — مشترک" />
          <CardBody className="space-y-2">
            {checkinsQuery.isLoading ? (
              <SkeletonBlock className="h-16" />
            ) : (checkinsQuery.data?.items.length ?? 0) === 0 && allMoods.length === 0 ? (
              <EmptyState icon={<span aria-hidden>📝</span>} title="تاریخچه‌ای نیست" description="اولین حال‌وهوا یا چک‌این را ثبت کنید." compact />
            ) : (
              <>
                {/* merged feed: moods + checkins by date */}
                {(() => {
                  type FeedItem = { key: string; date: string; kind: "mood" | "checkin"; data: MoodRow | CheckinRow };
                  const feed: FeedItem[] = [
                    ...allMoods.map((m) => ({ key: m.id, date: m.date, kind: "mood" as const, data: m as MoodRow | CheckinRow })),
                    ...(checkinsQuery.data?.items ?? []).map((c) => ({ key: c.id, date: c.date, kind: "checkin" as const, data: c as MoodRow | CheckinRow })),
                  ].sort((a, b) => isoDateInTz(new Date(b.date)).localeCompare(isoDateInTz(new Date(a.date))));
                  return feed.slice(0, 30).map((f) => {
                    const u = f.data.user;
                    const who = u.id === me?.id ? "من" : u.fullName;
                    if (f.kind === "mood") {
                      const m = f.data as MoodRow;
                      return (
                        <div key={f.key} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                          <span className="text-[20px]" aria-hidden>{MOOD_EMOJI[m.mood]}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-bold">{who}</div>
                            <div className="text-[11px] text-ink-faint">
                              {formatJalali(new Date(isoDateInTz(new Date(m.date)) + "T12:00:00+03:30"))} · {MOOD_FA[m.mood]}
                              {m.note ? ` — ${m.note}` : ""}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const c = f.data as CheckinRow;
                    return (
                      <div key={f.key} className="rounded-lg border border-line px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold">{who}</span>
                          <span className="text-[11px] text-ink-faint">{formatJalali(new Date(isoDateInTz(new Date(c.date)) + "T12:00:00+03:30"))}</span>
                        </div>
                        <div className="mt-1.5 space-y-1 text-[12px] leading-5">
                          {c.happy && <div className="text-emerald-700">😊 {c.happy}</div>}
                          {c.bothered && <div className="text-amber-700">😕 {c.bothered}</div>}
                          {c.need && <div className="text-sky-700">🤝 {c.need}</div>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
