"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card, CardHeader, CardBody, StatCard, EmptyState, SkeletonBlock,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { faPrice, faCount, CATEGORY_FA, CATEGORY_EMOJI, PRIORITY_FA, EVENT_KIND_FA, EVENT_KIND_EMOJI, MOOD_EMOJI, MOOD_FA } from "@/lib";
import { jalaliToday, J_MONTHS, J_WEEKDAYS_LONG } from "@/lib/jalali";
import { faStr, faNum } from "@/lib/fa";

interface DashboardData {
  today: {
    expenses: { id: string; title: string; amount: number; category: string; payer: string }[];
    expensesTotal: number;
    tasks: { id: string; title: string; dueDate: string | null; priority: string; assignedTo: { fullName: string } | null }[];
    events: { id: string; title: string; date: string; startTime: string | null; kind: string }[];
    myMood: { mood: string } | null;
    partnerMood: { mood: string; user: { fullName: string } } | null;
  };
  week: { expensesTotal: number };
  shopping: { id: string; title: string; priority: string; addedBy: string }[];
  provisions: { id: string; title: string }[];
  goals: { id: string; title: string; targetAmount: number; saved: number; pct: number }[];
  balance: { amount: number; direction: string };
  partner: { id: string; fullName: string; avatarEmoji: string | null } | null;
  upcoming: { id: string; title: string; kind: string; date: string; days: number }[];
  feed: { icon: string; text: string; at: string }[];
  cycle: { daysToNext: number; phase: string; cycleLen: number } | null;
  date: string;
}

const KIND_EMOJI: Record<string, string> = { BIRTHDAY: "🎂", ANNIVERSARY: "💞", WEDDING: "💍", CUSTOM: "⭐" };

function daysLabel(days: number): string {
  if (days === 0) return "امروز!";
  if (days === 1) return "فردا";
  return `${faNum(days)} روز دیگر`;
}

export function DashboardClient() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-28 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
        </div>
        <SkeletonBlock className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="داشبورد بارگذاری نشد"
        description="ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید."
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>تلاش دوباره</Button>}
      />
    );
  }

  const t = jalaliToday();
  const todayLabel = `${J_WEEKDAYS_LONG[new Date(data.date).getDay()]} ${faNum(t.jd)} ${J_MONTHS[t.jm - 1]}`;
  const partnerName = data.partner?.fullName ?? "همسرتان";

  return (
    <div className="space-y-4">
      {/* ── greeting ── */}
      <div className="rounded-2xl bg-ink p-4 text-white shadow-lg shadow-ink/20">
        <div className="text-[12px] opacity-70">{todayLabel}</div>
        <div className="mt-1 text-[16px] font-bold">سلام! امروز چطور پیش می‌رود؟</div>
        <div className="mt-3 flex gap-2">
          <Link href="/finance" className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-center text-[12px] font-medium transition-colors hover:bg-white/20">
            💸 ثبت هزینه
          </Link>
          <Link href="/shopping" className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-center text-[12px] font-medium transition-colors hover:bg-white/20">
            🛒 افزودن خرید
          </Link>
          <Link href="/tasks" className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-center text-[12px] font-medium transition-colors hover:bg-white/20">
            ✅ کار جدید
          </Link>
        </div>
      </div>

      {/* ── birthday / anniversary reminders ── */}
      {data.upcoming.length > 0 && (
        <div className="space-y-2">
          {data.upcoming.map((u) => {
            const isSoon = u.days <= 7;
            return (
              <div
                key={u.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  isSoon ? "border-rose-200 bg-rose-50" : "border-line bg-paper-soft"
                }`}
              >
                <span className="text-[20px]" aria-hidden>{KIND_EMOJI[u.kind] ?? "⭐"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{u.title}</div>
                  <div className="text-[11px] text-ink-faint">{daysLabel(u.days)}</div>
                </div>
                {isSoon && <span className="badge badge-red shrink-0">یادآوری</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── cycle care strip ── */}
      {data.cycle && (
        <Link
          href="/calendar"
          className="flex items-center gap-3 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2.5 transition-colors hover:bg-pink-100"
        >
          <span className="text-[20px]" aria-hidden>🌸</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold">
              {data.cycle.phase === "PERIOD"
                ? "روزهای قاعدگی است — مراقب همسرتان باشید"
                : data.cycle.phase === "LUTEAL"
                  ? "احتمال PMS — صبر و مهربانی بیشتر"
                  : "دوران خوب چرخه"}
            </div>
            <div className="text-[11px] text-ink-faint">
              {data.cycle.phase !== "PERIOD" && <>شروع دوره بعدی: {daysLabel(data.cycle.daysToNext)} — </>}
              چرخه ~{faNum(data.cycle.cycleLen)} روزه
            </div>
          </div>
        </Link>
      )}

      {/* ── stats ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="هزینه امروز"
          value={faPrice(data.today.expensesTotal)}
          icon={<span aria-hidden>💸</span>}
        />
        <StatCard
          label="هزینه این هفته"
          value={faPrice(data.week.expensesTotal)}
          icon={<span aria-hidden>📅</span>}
          tone={data.balance.direction !== "EVEN" ? "warn" : "default"}
          hint={
            data.balance.direction === "EVEN"
              ? "حساب‌ها برابر است"
              : data.balance.direction === "PARTNER_OWES_ME"
                ? `${partnerName} بدهکار است`
                : "شما بدهکار هستید"
          }
        />
      </div>

      {/* ── live activity feed ── */}
      {data.feed.length > 0 && (
        <Card>
          <CardHeader title="تازه‌ها" subtitle="رویدادهای دو روز گذشته" />
          <CardBody className="space-y-2">
            {data.feed.slice(0, 5).map((f, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-paper-soft px-3 py-2">
                <span className="text-[16px] shrink-0" aria-hidden>{f.icon}</span>
                <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed">{f.text}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* ── moods ── */}
      {(data.today.myMood || data.today.partnerMood) && (
        <Card>
          <CardHeader title="حال‌وهوای امروز" />
          <CardBody className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-paper-soft p-3 text-center">
              <div className="text-[24px]" aria-hidden>{data.today.myMood ? MOOD_EMOJI[data.today.myMood.mood] : "🫥"}</div>
              <div className="mt-1 text-[12px] font-medium">شما</div>
              <div className="text-[11px] text-ink-faint">{data.today.myMood ? MOOD_FA[data.today.myMood.mood] : "ثبت نشده"}</div>
            </div>
            <div className="rounded-lg bg-paper-soft p-3 text-center">
              <div className="text-[24px]" aria-hidden>{data.today.partnerMood ? MOOD_EMOJI[data.today.partnerMood.mood] : "🫥"}</div>
              <div className="mt-1 text-[12px] font-medium">{partnerName}</div>
              <div className="text-[11px] text-ink-faint">{data.today.partnerMood ? MOOD_FA[data.today.partnerMood.mood] : "ثبت نشده"}</div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── tasks ── */}
      <Card>
        <CardHeader
          title="کارهای امروز"
          action={<Link href="/tasks" className="text-[12px] font-bold text-ink-soft hover:text-ink">همه ←</Link>}
        />
        <CardBody className="space-y-2">
          {data.today.tasks.length === 0 ? (
            <EmptyState icon={<span aria-hidden>🎉</span>} title="امروز کاری ندارید" description="لیست کارهای خانه خالی است." />
          ) : (
            data.today.tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{task.title}</div>
                  {task.assignedTo && <div className="text-[11px] text-ink-faint">بر عهده {task.assignedTo.fullName}</div>}
                </div>
                {task.priority === "HIGH" && <span className="badge badge-red shrink-0">{PRIORITY_FA[task.priority]}</span>}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {/* ── events ── */}
      <Card>
        <CardHeader
          title="قرارهای پیش‌رو"
          action={<Link href="/calendar" className="text-[12px] font-bold text-ink-soft hover:text-ink">تقویم ←</Link>}
        />
        <CardBody className="space-y-2">
          {data.today.events.length === 0 ? (
            <EmptyState icon={<span aria-hidden>📅</span>} title="قراری در راه نیست" description="رویداد جدیدی در تقویم ثبت نشده است." />
          ) : (
            data.today.events.slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <span className="text-[18px]" aria-hidden>{EVENT_KIND_EMOJI[ev.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{ev.title}</div>
                  <div className="text-[11px] text-ink-faint">
                    {EVENT_KIND_FA[ev.kind]}
                    {ev.startTime ? ` — ${faStr(ev.startTime)}` : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {/* ── shopping + provisions ── */}
      <Card>
        <CardHeader
          title="خریدهای ضروری"
          action={<Link href="/shopping" className="text-[12px] font-bold text-ink-soft hover:text-ink">لیست ←</Link>}
        />
        <CardBody className="space-y-2">
          {data.shopping.length === 0 && data.provisions.length === 0 ? (
            <EmptyState icon={<span aria-hidden>🛒</span>} title="لیست خرید خالی است" description="چیزی برای خرید ندارید." />
          ) : (
            <>
              {data.shopping.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{item.title}</div>
                    {item.addedBy && <div className="text-[10.5px] text-ink-faint">اضافه‌شده توسط {item.addedBy}</div>}
                  </div>
                  {item.priority === "HIGH" && <span className="badge badge-red">فوری</span>}
                </div>
              ))}
              {data.provisions.length > 0 && (
                <Link
                  href="/shopping"
                  className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 transition-colors hover:bg-paper-soft"
                >
                  <span className="text-[12px] text-ink-soft">
                    📦 تهیه ماهانه: {data.provisions.slice(0, 2).map((p) => p.title).join("، ")}
                    {data.provisions.length > 2 ? " و…" : ""}
                  </span>
                  <span className="text-[11px] font-bold text-ink-faint">→</span>
                </Link>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* ── goals ── */}
      {data.goals.length > 0 && (
        <Card>
          <CardHeader
            title="اهداف در جریان"
            action={<Link href="/goals" className="text-[12px] font-bold text-ink-soft hover:text-ink">همه ←</Link>}
          />
          <CardBody className="space-y-3">
            {data.goals.map((g) => (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="font-medium">{g.title}</span>
                  <span className="text-ink-faint">{faCount(g.pct)}٪</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
                  <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${g.pct}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {faPrice(g.saved)} از {faPrice(g.targetAmount)}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* ── today's expenses ── */}
      <Card>
        <CardHeader
          title="هزینه‌های امروز"
          action={<Link href="/finance" className="text-[12px] font-bold text-ink-soft hover:text-ink">مالی ←</Link>}
        />
        <CardBody className="space-y-2">
          {data.today.expenses.length === 0 ? (
            <EmptyState icon={<span aria-hidden>💸</span>} title="هنوز هزینه‌ای ثبت نشده" description="اولین هزینه امروز را ثبت کنید." />
          ) : (
            data.today.expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <span className="text-[18px]" aria-hidden>{CATEGORY_EMOJI[e.category] ?? "📦"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{e.title}</div>
                  <div className="text-[11px] text-ink-faint">{CATEGORY_FA[e.category]} — پرداخت‌کننده {e.payer}</div>
                </div>
                <span className="shrink-0 text-[12px] font-bold">{faPrice(e.amount)}</span>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
