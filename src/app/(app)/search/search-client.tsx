"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { CATEGORY_FA, CATEGORY_EMOJI, faPrice } from "@/lib";
import { formatJalali } from "@/lib/jalali";

interface Results {
  expenses: { id: string; title: string; amount: number; category: string; date: string }[];
  shopping: { id: string; title: string; completed: boolean }[];
  tasks: { id: string; title: string; status: string }[];
  events: { id: string; title: string; date: string; kind: string }[];
  memories: { id: string; title: string; date: string }[];
  goals: { id: string; title: string; targetAmount: number }[];
}

export function SearchClient() {
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<{ results: Results }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const r = data?.results;
  const total = r ? r.expenses.length + r.shopping.length + r.tasks.length + r.events.length + r.memories.length + r.goals.length : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-black">جستجو</h1>

      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="در هزینه‌ها، کارها، خاطره‌ها…"
        className="h-11 w-full rounded-md border border-line bg-white px-4 text-[14px] outline-none focus:border-ink-soft"
      />

      {q.trim().length < 2 ? (
        <EmptyState
          icon={<span aria-hidden>🔍</span>}
          title="دنبال چی می‌گردید؟"
          description="حداقل ۲ حرف بنویسید — جستجو در همه بخش‌های خانواده شما."
        />
      ) : isLoading || isFetching ? (
        <div className="space-y-2"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
      ) : total === 0 ? (
        <EmptyState
          icon={<span aria-hidden>🤷</span>}
          title="چیزی پیدا نشد"
          description={`نتیجه‌ای برای «${q}» در داده‌های خانواده شما نیست.`}
        />
      ) : (
        <div className="space-y-4">
          {r!.expenses.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">💸 هزینه‌ها</div>
              {r!.expenses.map((e) => (
                <Link key={e.id} href="/finance" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{CATEGORY_EMOJI[e.category]} {e.title}</span>
                  <span className="text-[12px] font-bold">{faPrice(e.amount)}</span>
                </Link>
              ))}
            </Card>
          )}
          {r!.shopping.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">🛒 خرید</div>
              {r!.shopping.map((s) => (
                <Link key={s.id} href="/shopping" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{s.title}</span>
                  <span className="text-[11px] text-ink-faint">{s.completed ? "خریداری‌شده" : "در انتظار"}</span>
                </Link>
              ))}
            </Card>
          )}
          {r!.tasks.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">✅ کارها</div>
              {r!.tasks.map((t) => (
                <Link key={t.id} href="/tasks" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{t.title}</span>
                  <span className="text-[11px] text-ink-faint">{t.status === "DONE" ? "انجام‌شده" : "باز"}</span>
                </Link>
              ))}
            </Card>
          )}
          {r!.events.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">📅 رویدادها</div>
              {r!.events.map((e) => (
                <Link key={e.id} href="/calendar" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{e.title}</span>
                  <span className="text-[11px] text-ink-faint">{formatJalali(new Date(e.date))}</span>
                </Link>
              ))}
            </Card>
          )}
          {r!.memories.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">📖 خاطرات</div>
              {r!.memories.map((m) => (
                <Link key={m.id} href="/memories" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{m.title}</span>
                  <span className="text-[11px] text-ink-faint">{formatJalali(new Date(m.date))}</span>
                </Link>
              ))}
            </Card>
          )}
          {r!.goals.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2 text-[12px] font-bold">🎯 اهداف</div>
              {r!.goals.map((g) => (
                <Link key={g.id} href="/goals" className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper-soft">
                  <span className="text-[13px]">{g.title}</span>
                  <span className="text-[11px] text-ink-faint">هدف {faPrice(g.targetAmount)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
