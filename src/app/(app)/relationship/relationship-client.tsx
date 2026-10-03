"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { MOODS, MOOD_FA, MOOD_EMOJI, VISIBILITY_FA } from "@/lib";
import { formatJalali } from "@/lib/jalali";
import { cn } from "@/lib";

interface MoodRow {
  id: string; date: string; mood: string; note: string | null; visibility: string;
  user: { id: string; fullName: string };
}

interface CheckinRow {
  id: string; date: string; happy: string | null; bothered: string | null; need: string | null; visibility: string;
  user: { id: string; fullName: string };
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function RelationshipClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const [tab, setTab] = useState<"mood" | "checkin" | "history">("mood");

  const [mood, setMood] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [moodVisibility, setMoodVisibility] = useState<"PRIVATE" | "SHARED">("SHARED");

  const [happy, setHappy] = useState("");
  const [bothered, setBothered] = useState("");
  const [need, setNeed] = useState("");
  const [checkinVisibility, setCheckinVisibility] = useState<"PRIVATE" | "SHARED">("SHARED");

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
      json: { date: todayIso(), mood, note: moodNote.trim() || undefined, visibility: moodVisibility },
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
        visibility: checkinVisibility,
      },
    }),
    onSuccess: () => {
      invalidate();
      toast.push("چک‌این ثبت شد", "success");
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : "خطا", "error"),
  });

  const todayMood = (moodsQuery.data?.items ?? []).find((m) => m.user.id === me?.id && m.date.slice(0, 10) === todayIso());

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-black">رابطه ما</h1>

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
              subtitle={todayMood ? `امروز ${MOOD_EMOJI[todayMood.mood]} ${MOOD_FA[todayMood.mood]} ثبت کرده‌اید` : "حال‌وهوای امروزتان را ثبت کنید"}
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="حال‌وهوا">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mood === m || todayMood?.mood === m}
                    onClick={() => setMood(m)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-3 transition-colors",
                      mood === m ? "border-ink bg-paper-soft" : "border-line bg-white hover:bg-paper-soft",
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
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {(["SHARED", "PRIVATE"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setMoodVisibility(v)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                        moodVisibility === v ? "bg-ink text-white" : "bg-paper-soft text-ink-soft",
                      )}
                    >
                      {v === "PRIVATE" ? "🔒 خصوصی" : "👁️ " + VISIBILITY_FA[v]}
                    </button>
                  ))}
                </div>
                <Button size="sm" loading={moodMutation.isPending} disabled={!mood} onClick={() => moodMutation.mutate()}>
                  ثبت
                </Button>
              </div>
              <p className="text-[11px] leading-5 text-ink-faint">
                🔒 حال‌وهوای خصوصی فقط برای خودتان قابل دیدن است — نه از API، نه هیچ‌جا.
              </p>
            </CardBody>
          </Card>

          {/* shared recent moods */}
          <Card>
            <CardHeader title="حال‌وهوای اخیر" subtitle="فقط موارد مشترک" />
            <CardBody className="space-y-2">
              {moodsQuery.isLoading ? (
                <SkeletonBlock className="h-16" />
              ) : (moodsQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState icon={<span aria-hidden>💞</span>} title="هنوز حال‌وهوایی ثبت نشده" compact />
              ) : (
                moodsQuery.data!.items.slice(0, 10).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                    <span className="text-[20px]" aria-hidden>{MOOD_EMOJI[m.mood]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold">
                        {m.user.id === me?.id ? "من" : m.user.fullName}
                        {m.visibility === "PRIVATE" && <span className="mr-1.5 badge badge-gray">🔒 خصوصی</span>}
                      </div>
                      <div className="text-[11px] text-ink-faint">
                        {formatJalali(new Date(m.date))} · {MOOD_FA[m.mood]}
                        {m.note ? ` — ${m.note}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "checkin" && (
        <Card>
          <CardHeader title="چک‌این امروز" subtitle="سه سؤال کوتاه برای قلب‌به‌قلب بودن" />
          <CardBody className="space-y-3">
            <div>
              <label htmlFor="چه چیزی امروز خوشحالت کرد؟" className="mb-1.5 block text-[12px] font-medium text-ink-soft">چه چیزی امروز خوشحالت کرد؟</label>
              <textarea id="چه چیزی امروز خوشحالت کرد؟" value={happy} onChange={(e) => setHappy(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div>
              <label htmlFor="چه چیزی اذیتت کرد؟" className="mb-1.5 block text-[12px] font-medium text-ink-soft">چه چیزی اذیتت کرد؟</label>
              <textarea id="چه چیزی اذیتت کرد؟" value={bothered} onChange={(e) => setBothered(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div>
              <label htmlFor="امروز چه چیزی از همسرت نیاز داری؟" className="mb-1.5 block text-[12px] font-medium text-ink-soft">امروز چه چیزی از همسرت نیاز داری؟</label>
              <textarea id="امروز چه چیزی از همسرت نیاز داری؟" value={need} onChange={(e) => setNeed(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(["SHARED", "PRIVATE"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCheckinVisibility(v)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                      checkinVisibility === v ? "bg-ink text-white" : "bg-paper-soft text-ink-soft",
                    )}
                  >
                    {v === "PRIVATE" ? "🔒 خصوصی" : "👁️ " + VISIBILITY_FA[v]}
                  </button>
                ))}
              </div>
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
          <CardHeader title="تاریخچه" subtitle="حال‌وهوها و چک‌این‌های قابل نمایش" />
          <CardBody className="space-y-2">
            {checkinsQuery.isLoading ? (
              <SkeletonBlock className="h-16" />
            ) : (checkinsQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState icon={<span aria-hidden>📝</span>} title="تاریخچه‌ای نیست" compact />
            ) : (
              checkinsQuery.data!.items.slice(0, 15).map((c) => (
                <div key={c.id} className="rounded-lg border border-line px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold">
                      {c.user.id === me?.id ? "من" : c.user.fullName}
                      {c.visibility === "PRIVATE" && <span className="mr-1.5 badge badge-gray">🔒 خصوصی</span>}
                    </span>
                    <span className="text-[11px] text-ink-faint">{formatJalali(new Date(c.date))}</span>
                  </div>
                  <div className="mt-1.5 space-y-1 text-[12px] leading-5">
                    {c.happy && <div className="text-emerald-700">😊 {c.happy}</div>}
                    {c.bothered && <div className="text-amber-700">😕 {c.bothered}</div>}
                    {c.need && <div className="text-sky-700">🤝 {c.need}</div>}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
