"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn, faNum } from "@/lib";
import { api } from "@/lib/api";
import { InstallBanner } from "@/components/layout/install-banner";
import { useAuth } from "@/lib/auth-store";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AppIcon } from "@/components/ui/icon";
import {
  LayoutDashboard, BarChart3, CheckCheck, CalendarDays,
  Users, MessageCircle, Sparkles, Bell, Settings, LogOut,
} from "@/components/ui/icon";
import { ConfirmModalHost } from "@/components/ui/confirm-modal";

// ── nav definition (mobile-first bottom nav + drawer) ──────────────────

export const NAV: { href: string; label: string; icon: AppIcon }[] = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/finance", label: "مالی", icon: BarChart3 },
  { href: "/shopping", label: "خرید", icon: CheckCheck }, // placeholder replaced below
  { href: "/tasks", label: "کارها", icon: CheckCheck },
  { href: "/calendar", label: "تقویم", icon: CalendarDays },
  { href: "/meals", label: "غذا", icon: Users },
  { href: "/relationship", label: "رابطه", icon: Users },
  { href: "/memories", label: "خاطرات", icon: MessageCircle },
  { href: "/goals", label: "اهداف", icon: BarChart3 },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell },
  { href: "/assistant", label: "دستیار", icon: Sparkles },
  { href: "/settings", label: "تنظیمات", icon: Settings },
];

const BOTTOM_NAV = [NAV[0], NAV[1], NAV[4], NAV[6], NAV[11]]; // dashboard, finance, calendar, relationship, settings

function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => api<{ unreadCount: number }>("/api/notifications?count=1"),
    refetchInterval: 30_000,
  });
  return data?.unreadCount ?? 0;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loaded, refresh, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = useUnreadCount();

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-soft">
        <div className="skeleton h-10 w-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-soft">
      {/* ── top header ── */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[600px] items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-[20px]" aria-hidden>🏡</span>
            <div className="leading-tight">
              <div className="text-[14px] font-bold">{me?.household?.name ?? "لایف‌هاب"}</div>
              <div className="text-[11px] text-ink-faint">{me?.household?.partner?.fullName ?? "در انتظار همسر…"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/notifications"
              aria-label="اعلان‌ها"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                  {faNum(unread > 9 ? "9+" : unread)}
                </span>
              )}
            </Link>
            <Link href="/settings" aria-label="پروفایل" className="mr-1">
              <UserAvatar name={me?.fullName ?? "?"} size={32} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── main content: centered 600px shell ── */}
      <main className="mx-auto min-h-[calc(100vh-3.5rem-4rem)] max-w-[600px] px-4 pb-24 pt-4">
        {children}
      </main>

      <InstallBanner />

      {/* ── mobile bottom nav ── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-line bg-white/95 backdrop-blur" aria-label="ناوبری اصلی">
        <div className="mx-auto flex h-16 max-w-[600px] items-stretch justify-between px-2">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const showBadge = item.href === "/notifications" && unread > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1 transition-colors",
                  active ? "text-ink" : "text-ink-faint hover:text-ink-soft",
                )}
              >
                <span className="relative">
                  <Icon size={22} />
                  {showBadge && unread > 0 && (
                    <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-danger" />
                  )}
                </span>
                <span className={cn("text-[10px]", active && "font-bold")}>{item.label}</span>
                {active && (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-ink" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── more drawer (secondary nav) ── */}
      <>
        {drawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 animate-[lh-fade_.15s_ease-out] bg-black/30"
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-[600px] animate-[lh-slide-up_.22s_cubic-bezier(.32,0,.67,0)] rounded-t-2xl border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div className="mb-3 text-center text-[12px] text-ink-faint">بیشتر</div>
              <div className="grid grid-cols-4 gap-2">
                {NAV.filter((n) => !BOTTOM_NAV.includes(n)).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex flex-col items-center gap-1.5 rounded-xl bg-paper-soft py-3 text-[11px] text-ink-soft transition-colors hover:bg-paper-deep"
                    >
                      <Icon size={22} />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  onClick={() => logout()}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-red-50 py-3 text-[11px] text-red-600 transition-colors hover:bg-red-100"
                >
                  <LogOut size={22} />
                  خروج
                </button>
              </div>
            </div>
          </>
        )}
      </>

      {/* floating more button — opens secondary nav */}
      {!drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="بیشتر"
          className="fixed bottom-[4.75rem] left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-transform active:scale-95"
          style={{ left: "max(1rem, calc(50vw - 300px + 1rem))" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <ConfirmModalHost />
    </div>
  );
}
