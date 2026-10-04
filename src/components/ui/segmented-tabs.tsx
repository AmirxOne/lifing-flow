"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib";

/**
 * Tab text simple — bold underline for the active tab, no box or background.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: T; label: string; icon?: ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div dir="rtl" role="tablist" className={cn("flex items-stretch gap-5 border-b border-line", className)}>
      {items.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex h-10 items-center gap-1.5 whitespace-nowrap px-1 text-[13px] font-medium transition-colors duration-150",
              active ? "text-ink" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ink transition-opacity duration-150",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
