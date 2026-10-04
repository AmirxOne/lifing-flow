"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SkeletonBlock } from "@/components/ui/card";
import { faNum } from "@/lib/fa";
import { cn } from "@/lib";

interface ChatTurn {
  id: number;
  question: string;
  answer: string;
}

const MODES = [
  { value: "ASK", label: "💬 گفتگو", hint: "سؤال عمومی درباره خانه" },
  { value: "FINANCE", label: "💸 تحلیل مالی", hint: "هزینه‌های ماه را تحلیل کن" },
  { value: "MEAL_PLAN", label: "🍽️ برنامه غذایی", hint: "برای هفته آینده برنامه بساز" },
  { value: "SHOPPING", label: "🛒 لیست خرید", hint: "بر اساس برنامه غذایی" },
  { value: "DATE_NIGHT", label: "💞 قرار دونفره", hint: "با بودجه مشخص پیشنهاد بده" },
] as const;

const SUGGESTIONS: Record<string, string[]> = {
  ASK: ["کارهای خانه این هفته را خلاصه کن", "وضعیت کلی خانه چطور است؟"],
  FINANCE: ["هزینه‌های این ماه را تحلیل کن", "کجا بیشترین خرج را داشتیم؟"],
  MEAL_PLAN: ["برای هفته آینده برنامه غذایی بساز"],
  SHOPPING: ["بر اساس برنامه غذایی لیست خرید بساز"],
  DATE_NIGHT: ["با بودجه ۵۰۰ هزار تومان قرار دونفره پیشنهاد بده"],
};

export function AssistantClient() {
  const [mode, setMode] = useState<string>("ASK");
  const [question, setQuestion] = useState("");
  const [budget, setBudget] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const askMutation = useMutation({
    mutationFn: () => api<{ answer: string }>("/api/ai", {
      method: "POST",
      json: {
        mode,
        question: question.trim(),
        ...(mode === "DATE_NIGHT" && budget ? { budget: Number(budget.replace(/[^0-9]/g, "")) } : {}),
      },
    }),
    onSuccess: (res) => {
      setTurns((prev) => [{ id: Date.now(), question: question.trim(), answer: res.answer }, ...prev].slice(0, 10));
      setQuestion("");
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[18px] font-black">دستیار لایف‌هاب</h1>
        <p className="mt-1 text-[12px] text-ink-soft">فقط با داده واقعی خانواده شما کار می‌کند — چیزی از خودش نمی‌سازد.</p>
      </div>

      {/* mode chips */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="حالت دستیار">
        {MODES.map((m) => (
          <button
            key={m.value}
            role="tab"
            aria-selected={mode === m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors",
              mode === m.value ? "bg-ink text-white" : "bg-white text-ink-soft border border-line hover:bg-paper-soft",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ask box */}
      <Card className="p-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-line px-3 py-2 text-[13px] outline-none focus:border-ink-soft"
          placeholder={MODES.find((m) => m.value === mode)?.hint}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && question.trim() && !askMutation.isPending) {
              e.preventDefault();
              askMutation.mutate();
            }
          }}
        />
        {mode === "DATE_NIGHT" && (
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[13px] outline-none focus:border-ink-soft"
            placeholder="بودجه به تومان — مثلاً ۵۰۰۰۰۰"
          />
        )}
        {askMutation.isError && (
          <div role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">
            {askMutation.error instanceof Error ? askMutation.error.message : "خطا — دوباره تلاش کنید"}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {(SUGGESTIONS[mode] ?? []).map((s) => (
              <button
                key={s}
                onClick={() => setQuestion(s)}
                className="shrink-0 rounded-full bg-paper-soft px-3 py-1.5 text-[11px] text-ink-soft transition-colors hover:bg-paper-deep"
              >
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" loading={askMutation.isPending} disabled={!question.trim()} onClick={() => askMutation.mutate()}>
            بپرس
          </Button>
        </div>
      </Card>

      {/* answers */}
      <div className="space-y-3">
        {turns.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden>🤖</span>}
            title="هنوز چیزی نپرسیده‌اید"
            description="یکی از پیشنهادهای بالا را امتحان کنید."
          />
        ) : (
          turns.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <div className="border-b border-line bg-paper-soft px-4 py-2.5 text-[12px] font-bold">
                {t.question}
              </div>
              <div className="whitespace-pre-line px-4 py-3 text-[13px] leading-6">{t.answer}</div>
            </Card>
          ))
        )}
      </div>

      {turns.length > 0 && (
        <p className="text-center text-[11px] text-ink-faint">
          {faNum(turns.length)} گفتگوی اخیر — پاسخ‌ها از داده واقعی خانه شما محاسبه می‌شوند
        </p>
      )}
    </div>
  );
}
