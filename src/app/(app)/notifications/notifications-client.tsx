"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
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

const TYPE_EMOJI: Record<string, string> = {
  EXPENSE: "💸", SHOPPING: "🛒", TASK: "✅", EVENT: "📅", REMINDER: "⏰",
  GOAL: "🎯", IMPORTANT_DATE: "🎂", INVITE: "💌", ACTIVITY: "🔁", AI: "🤖",
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
      qc.invalidateQueries({ queryKey: ["notifications", "count"] });
    },
  });

  const items = listQuery.data?.items ?? [];
  const unreadCount = listQuery.data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-black">اعلان‌ها</h1>
        {unreadCount > 0 && (
          <Button size="sm" variant="ghost" loading={markMutation.isPending} onClick={() => markMutation.mutate()}>
            خواندن همه
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
        <div className="space-y-2"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden>🔔</span>}
          title={tab === "unread" ? "همه را خوانده‌اید" : "اعلانی ندارید"}
          description="فعالیت‌های همسرتان و یادآورها اینجا اعلام می‌شوند."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const unread = !n.readAt;
            const inner = (
              <div className={cn("flex items-start gap-3 p-3", unread && "bg-white")}>
                <span className="mt-0.5 text-[18px]" aria-hidden>{TYPE_EMOJI[n.type] ?? "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate text-[13px]", unread ? "font-bold" : "font-medium")}>{n.title}</span>
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
              <Card key={n.id} className={cn("overflow-hidden", unread && "ring-1 ring-ink/10")}>
                {n.link ? (
                  <a href={n.link} className="block transition-colors hover:bg-paper-soft" onClick={() => !n.readAt && markMutation.mutate(n.id)}>
                    {inner}
                  </a>
                ) : (
                  <button className="w-full text-right" onClick={() => !n.readAt && markMutation.mutate(n.id)}>
                    {inner}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
