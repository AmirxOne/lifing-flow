import { describe, it, expect } from "vitest";

/** Mirror of the server's 50/50 shared-expense balance rule. */
function computeBalance(
  expenses: { amount: number; payerId: string; isShared: boolean }[],
  myId: string,
): { amount: number; direction: "PARTNER_OWES_ME" | "I_OWE_PARTNER" | "EVEN" } {
  let owed = 0;
  for (const e of expenses) {
    if (!e.isShared) continue;
    const half = e.amount / 2;
    if (e.payerId === myId) owed += half;
    else owed -= half;
  }
  return {
    amount: Math.abs(owed),
    direction: owed > 0 ? "PARTNER_OWES_ME" : owed < 0 ? "I_OWE_PARTNER" : "EVEN",
  };
}

describe("50/50 shared-expense balance", () => {
  const ME = "me";
  const PARTNER = "partner";

  it("empty → even", () => {
    expect(computeBalance([], ME)).toEqual({ amount: 0, direction: "EVEN" });
  });

  it("I paid 1,000,000 shared → partner owes me 500,000", () => {
    const b = computeBalance([{ amount: 1_000_000, payerId: ME, isShared: true }], ME);
    expect(b.direction).toBe("PARTNER_OWES_ME");
    expect(b.amount).toBe(500_000);
  });

  it("partner paid 400,000 shared → I owe 200,000", () => {
    const b = computeBalance([{ amount: 400_000, payerId: PARTNER, isShared: true }], ME);
    expect(b.direction).toBe("I_OWE_PARTNER");
    expect(b.amount).toBe(200_000);
  });

  it("equal opposite payments cancel out", () => {
    const b = computeBalance([
      { amount: 1_000_000, payerId: ME, isShared: true },
      { amount: 1_000_000, payerId: PARTNER, isShared: true },
    ], ME);
    expect(b.direction).toBe("EVEN");
    expect(b.amount).toBe(0);
  });

  it("personal expenses are excluded from balance", () => {
    const b = computeBalance([
      { amount: 5_000_000, payerId: ME, isShared: false },
      { amount: 1_000_000, payerId: PARTNER, isShared: true },
    ], ME);
    expect(b.direction).toBe("I_OWE_PARTNER");
    expect(b.amount).toBe(500_000);
  });

  it("spec example: amirhossein paid 1,000,000 → سهم هر نفر 500,000", () => {
    const b = computeBalance([{ amount: 1_000_000, payerId: ME, isShared: true }], ME);
    expect(b.amount).toBe(1_000_000 / 2);
  });
});

describe("goal progress", () => {
  function progress(saved: number, target: number): { pct: number; done: boolean } {
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    return { pct, done: pct >= 100 };
  }

  it("35M of 100M → 35%", () => {
    expect(progress(35_000_000, 100_000_000)).toEqual({ pct: 35, done: false });
  });

  it("over-saving caps at 100", () => {
    expect(progress(150, 100).pct).toBe(100);
  });

  it("zero target → 0% not NaN", () => {
    expect(progress(50, 0)).toEqual({ pct: 0, done: false });
  });

  it("exact target → done", () => {
    expect(progress(100, 100)).toEqual({ pct: 100, done: true });
  });
});

describe("budget near-limit logic (server rule)", () => {
  function budgetState(spent: number, amount: number): { pct: number; over: boolean; nearLimit: boolean } {
    const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
    return {
      pct,
      over: spent > amount,
      nearLimit: pct >= 80 && spent <= amount,
    };
  }

  it("7.2M of 10M → 72% no warning", () => {
    const s = budgetState(7_200_000, 10_000_000);
    expect(s.pct).toBe(72);
    expect(s.nearLimit).toBe(false);
  });

  it("8.5M of 10M → near limit", () => {
    const s = budgetState(8_500_000, 10_000_000);
    expect(s.nearLimit).toBe(true);
    expect(s.over).toBe(false);
  });

  it("10.5M of 10M → over, not near", () => {
    const s = budgetState(10_500_000, 10_000_000);
    expect(s.over).toBe(true);
    expect(s.nearLimit).toBe(false);
  });
});

describe("recurring task next-due-date rule (server mirror)", () => {
  function nextDueDate(current: Date, recurrence: string, interval: number): Date | null {
    const d = new Date(current);
    switch (recurrence) {
      case "DAILY": d.setDate(d.getDate() + interval); return d;
      case "WEEKLY": d.setDate(d.getDate() + 7 * interval); return d;
      case "MONTHLY": {
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + interval);
        const lastOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastOfTarget));
        return d;
      }
      case "CUSTOM": d.setDate(d.getDate() + interval); return d;
      default: return null;
    }
  }

  it("daily advances one day", () => {
    const next = nextDueDate(new Date(2026, 9, 3), "DAILY", 1)!;
    expect(next.getDate()).toBe(4);
  });

  it("weekly advances 7 days across week boundary", () => {
    const next = nextDueDate(new Date(2026, 9, 3), "WEEKLY", 1)!; // Sat
    expect(next.getDate()).toBe(10);
    expect(next.getDay()).toBe(6);
  });

  it("monthly clamps month-end overflow (Oct 31 +1mo → Nov 30, not Dec 1)", () => {
    const next = nextDueDate(new Date(2026, 9, 31), "MONTHLY", 1)!; // Oct 31
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(30);
  });

  it("monthly normal dates advance exactly one month", () => {
    const next = nextDueDate(new Date(2026, 9, 15), "MONTHLY", 1)!;
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(15);
  });

  it("none → null (no respawn)", () => {
    expect(nextDueDate(new Date(), "NONE", 1)).toBeNull();
  });
});
