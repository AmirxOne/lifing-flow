"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib";
import { faNum } from "@/lib/fa";

/**
 * Collapsible filter box — a toggle button (with active-filter count badge)
 * that smoothly expands the filter controls below it. Closed by default.
 */
export function FilterPanel({
  activeCount = 0,
  onReset,
  children,
  label = "فیلترها",
}: {
  activeCount?: number;
  onReset?: () => void;
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="filter-panel-body"
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
            open || activeCount > 0
              ? "border-ink bg-ink text-white"
              : "border-line bg-white text-ink-soft hover:border-ink-soft",
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {label}
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-bold">
              {faNum(activeCount)}
            </span>
          )}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden
            className={cn("transition-transform duration-200", open && "rotate-180")}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {activeCount > 0 && onReset && (
          <button
            onClick={onReset}
            className="text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            پاک کردن
          </button>
        )}
      </div>

      <div
        id="filter-panel-body"
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.32,0,.67,0)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="rounded-lg border border-line bg-white p-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
