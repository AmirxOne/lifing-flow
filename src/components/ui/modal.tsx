"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/ui/icon";
import { cn } from "@/lib";

/**
 * Responsive dialog: centered modal on desktop, bottom sheet on mobile
 * (slides up, drag handle, drag-to-dismiss). Closes on backdrop/Esc.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // جلوگیری از بسته‌شدن ناگهانی: کلیک‌هایی که در همان لحظه‌ی باز شدن مودال رخ می‌دهند
  // (مثلاً رهاشدن دیرهنگام کلیک آیتم منو زیر مودال) روی بک‌دراپ را نادیده می‌گیریم
  const openedAt = useRef(0);
  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open]);
  const backdropGuard = (e: React.MouseEvent) => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  };

  // Esc to close + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!ready) return null;

  return createPortal(
    <>
      {open && (
        <>
          <div
            onClick={backdropGuard}
            className="fixed inset-0 z-50 animate-[lh-fade_.15s_ease-out] bg-black/45"
          />
          {/* always a bottom sheet — mobile & desktop alike (app shell law) */}
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) backdropGuard(e); }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn(
                "flex max-h-[92dvh] w-full max-w-[600px] animate-[lh-slide-up_.22s_cubic-bezier(.32,0,.67,0)] flex-col rounded-t-xl bg-white shadow-2xl",
                wide && "sm:max-w-[600px]",
              )}
            >
              {/* drag handle affordance */}
              <div className="flex justify-center pt-2.5" aria-hidden>
                <div className="h-1.5 w-10 rounded-full bg-line" />
              </div>

              {/* header */}
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-bold">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-[11px] text-ink-soft">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-soft hover:text-ink"
                  aria-label="بستن"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

              {footer && (
                <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">{footer}</div>
              )}
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
