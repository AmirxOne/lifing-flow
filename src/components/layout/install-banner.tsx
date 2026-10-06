"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Bottom-sheet "install app" banner using the standard beforeinstallprompt
 * flow. Hidden when: already installed (display-mode: standalone), dismissed
 * by the user (remembered in localStorage), or unsupported (iOS Safari uses
 * the Share → Add to Home Screen flow instead — we show a hint for that).
 */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("lh-install-dismissed") === "1") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari never fires beforeinstallprompt — show the manual hint
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (ios) {
      const t = setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
      setDeferred(null);
    }
  }

  function dismiss() {
    localStorage.setItem("lh-install-dismissed", "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[600px] items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">لایف‌هاب را نصب کنید</div>
          <div className="text-[11px] leading-4 text-ink-faint">
            {showIosHint && !deferred
              ? "در سافاری: Share ← Add to Home Screen"
              : "دسترسی سریع مثل یک اپ واقعی — حتی آفلاین"}
          </div>
        </div>
        {deferred ? (
          <button
            onClick={install}
            className="shrink-0 rounded-lg bg-ink px-3.5 py-2 text-[12px] font-bold text-white transition-transform active:scale-95"
          >
            نصب
          </button>
        ) : null}
        <button
          onClick={dismiss}
          aria-label="بستن"
          className="shrink-0 rounded-lg p-2 text-ink-faint transition-colors hover:bg-paper-soft"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
