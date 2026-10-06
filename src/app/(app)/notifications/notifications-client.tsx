"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonBlock } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useState } from "react";
import { NOTIF_TYPE_FA, faNum } from "@/lib";
import { cn } from "@/lib";

interface Notif {
  id: string; type: string; title: string; body: string | null;
  link: string | null; readAt: string | null; createdAt: string;
}

function timeAgoFa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "همین حالا";
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${faNum(days)} روز پیش`;
  return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", month: "long", day: "numeric" }).format(new Date(iso));
}

function dayLabelFa(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(x);
  if (startOf(d) === startOf(today)) return "امروز";
  const yest = new Date(today.getTime() - 86_400_000);
  if (startOf(d) === startOf(yest)) return "دیروز";
  return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long", month: "long", day: "numeric" }).format(d);
}

const TYPE_EMOJI: Record<string, string> = {
  EXPENSE: "💸", SHOPPING: "🛒", TASK: "✅", EVENT: "📅", REMINDER: "⏰",
  GOAL: "🎯", IMPORTANT_DATE: "🎂", INVITE: "💌", ACTIVITY: "🔁", AI: "🤖",
};

const TYPE_TONE: Record<string, string> = {
  EXPENSE: "bg-amber-50", SHOPPING: "bg-emerald-50", TASK: "bg-sky-50",
  EVENT: "bg-violet-50", IMPORTANT_DATE: "bg-rose-50", INVITE: "bg-pink-50",
  GOAL: "bg-teal-50",
};

export function NotificationsClient() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");

  const listQuery = useQuery({
    queryKey: ["notifications", tab],
    queryFn: () => api<{ items: Notif[]; unreadCount: number }>(`/api/notifications${tab === "unread" ? "?unread=1" : ""}`),
    refetchInterval: 15_000,
  });

  const markMutation = useMutation({
    mutationFn: (id?: string) => api("/api/notifications", { method: "PATCH", json: id ? { id } : {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const items = listQuery.data?.items ?? [];
  const unreadCount = listQuery.data?.unreadCount ?? 0;

  // group by Tehran day, newest first
  const groups: { day: string; items: Notif[] }[] = [];
  for (const n of items) {
    const day = dayLabelFa(n.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(n);
    else groups.push({ day, items: [n] });
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-black">اعلان‌ها</h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-[11.5px] text-ink-faint">{faNum(unreadCount)} اعلان خوانده‌نشده</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="ghost" loading={markMutation.isPending} onClick={() => markMutation.mutate()}>
            علامت‌زدن همه ✓
          </Button>
        )}
      </div>

      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { id: "all", label: "همه" },
          { id: "unread", label: `خوانده‌نشده${unreadCount ? ` (${faNum(unreadCount)})` : ""}` },
        ]}
      />

      {listQuery.isLoading ? (
        <div className="space-y-2"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>🔔</span>}
          title={tab === "unread" ? "همه را خوانده‌اید" : "اعلانی ندارید"}
          description="فعالیت‌های همسرتان و یادآورها اینجا اعلام می‌شوند."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-2 px-1 text-[11.5px] font-bold text-ink-faint">{g.day}</h2>
              <div className="space-y-2">
                {g.items.map((n) => {
                  const unread = !n.readAt;
                  const inner = (
                    <div className="flex items-start gap-3 p-3">
                      <span className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px]",
                        TYPE_TONE[n.type] ?? "bg-paper-soft",
                      )} aria-hidden>
                        {TYPE_EMOJI[n.type] ?? "🔔"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate text-[13px]", unread ? "font-bold" : "font-medium text-ink-soft")}>{n.title}</span>
                          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="خوانده‌نشده" />}
                        </div>
                        {n.body && <div className="mt-0.5 text-[12px] leading-5 text-ink-soft">{n.body}</div>}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                          <span className="badge badge-gray">{NOTIF_TYPE_FA[n.type] ?? n.type}</span>
                          <span>{timeAgoFa(n.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "overflow-hidden rounded-xl border transition-colors",
                        unread ? "border-ink/15 bg-white shadow-sm" : "border-line bg-paper/60",
                      )}
                    >
                      {n.link ? (
                        <a href={n.link} className="block transition-colors hover:bg-paper-soft" onClick={() => !n.readAt && markMutation.mutate(n.id)}>
                          {inner}
                        </a>
                      ) : (
                        <button className="w-full text-right" onClick={() => !n.readAt && markMutation.mutate(n.id)}>
                          {inner}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
