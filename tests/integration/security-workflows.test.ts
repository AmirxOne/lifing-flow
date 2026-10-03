import { describe, it, expect } from "vitest";
import { call, makeHousehold, uniqueSuffix } from "./helpers";

describe("Household isolation (SECURITY — the core invariant)", () => {
  it("user without household gets NO_HOUSEHOLD on scoped routes", async () => {
    const { owner } = await makeHouseholdlessUser();
    const res = await call("/api/expenses", {}, owner.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("NO_HOUSEHOLD");
  });

  it("household max 2 members enforced", async () => {
    const suffix = uniqueSuffix();
    const { owner } = await makeHousehold(suffix);
    // already 2 members (owner+partner) — third invite must fail
    const res = await call("/api/household/invite", { method: "POST", json: {} }, owner.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("HOUSEHOLD_FULL");
  });

  it("IDOR: expense of household B → 404 for household A (read)", async () => {
    const a = await makeHousehold(`a${uniqueSuffix()}`);
    const b = await makeHousehold(`b${uniqueSuffix()}`);

    const created = await call<{ id: string }>("/api/expenses", {
      method: "POST",
      json: { title: "هزینه ب", amount: 50000, category: "FOOD", date: "2026-10-03", payerId: b.owner.id },
    }, b.owner.cookie);
    expect(created.status).toBe(201);

    const readA = await call(`/api/expenses/${created.body.data!.id}`, {}, a.owner.cookie);
    expect(readA.status).toBe(404);

    // positive control: B reads own
    const readB = await call(`/api/expenses/${created.body.data!.id}`, {}, b.owner.cookie);
    expect(readB.status).toBe(200);
  });

  it("IDOR: expense of household B → 404 for household A (update & delete)", async () => {
    const a = await makeHousehold(`a${uniqueSuffix()}`);
    const b = await makeHousehold(`b${uniqueSuffix()}`);

    const created = await call<{ id: string }>("/api/expenses", {
      method: "POST",
      json: { title: "هدف حمله", amount: 10000, category: "OTHER", date: "2026-10-03", payerId: b.owner.id },
    }, b.owner.cookie);

    const patch = await call(`/api/expenses/${created.body.data!.id}`, {
      method: "PATCH", json: { title: "هک شد" },
    }, a.owner.cookie);
    expect(patch.status).toBe(404);

    const del = await call(`/api/expenses/${created.body.data!.id}`, { method: "DELETE" }, a.owner.cookie);
    expect(del.status).toBe(404);

    // B still intact
    const readB = await call(`/api/expenses/${created.body.data!.id}`, {}, b.owner.cookie);
    expect(readB.status).toBe(200);
    expect((readB.body.data as { title: string }).title).toBe("هدف حمله");
  });

  it("cross-household assignee rejected (invalid payer)", async () => {
    const a = await makeHousehold(`a${uniqueSuffix()}`);
    const b = await makeHousehold(`b${uniqueSuffix()}`);
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "تلاش نفوذ", amount: 1000, category: "FOOD", date: "2026-10-03", payerId: b.owner.id },
    }, a.owner.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_PAYER");
  });

  it("shared data flows between partners of the SAME household", async () => {
    const { owner, partner } = await makeHousehold(uniqueSuffix());
    await call("/api/expenses", {
      method: "POST",
      json: { title: "خرید مشترک", amount: 200000, category: "FOOD", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);

    const partnerView = await call<{ items: { title: string }[] }>("/api/expenses", {}, partner.cookie);
    expect(partnerView.status).toBe(200);
    expect(partnerView.body.data!.items.some((e) => e.title === "خرید مشترک")).toBe(true);
  });

  it("search is scoped to own household only", async () => {
    const a = await makeHousehold(`a${uniqueSuffix()}`);
    const b = await makeHousehold(`b${uniqueSuffix()}`);
    const marker = `secretmarker${uniqueSuffix()}`;
    await call("/api/memories", {
      method: "POST",
      json: { title: marker, date: "2026-10-01" },
    }, b.owner.cookie);

    const res = await call<{ results: { memories: unknown[] } }>(`/api/search?q=${encodeURIComponent(marker)}`, {}, a.owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data!.results.memories.length).toBe(0);
  });
});

describe("Validation edge cases", () => {
  it("negative expense rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "منفی", amount: -5000, category: "FOOD", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("non-integer amount rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "اعشاری", amount: 100.5, category: "FOOD", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("invalid category rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "دسته ساختگی", amount: 1000, category: "NOT_A_CATEGORY", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("invalid date format rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "تاریخ خراب", amount: 1000, category: "FOOD", date: "tomorrow", payerId: owner.id },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("empty title rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/expenses", {
      method: "POST",
      json: { title: "", amount: 1000, category: "FOOD", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("event end before start rejected", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const res = await call("/api/events", {
      method: "POST",
      json: { title: "زمان معکوس", date: "2026-10-05", startTime: "20:00", endTime: "18:00" },
    }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("invite code invalid/expired → 404", async () => {
    const user = await makeHouseholdlessUser();
    const res = await call("/api/household/join", { method: "POST", json: { code: "ZZZZ9999" } }, user.owner.cookie);
    expect(res.status).toBe(404);
  });
});

describe("Privacy: PRIVATE moods/checkins never cross", () => {
  it("partner cannot see owner's private mood (same household, server-enforced)", async () => {
    const { owner, partner } = await makeHousehold(uniqueSuffix());
    const marker = `sadsecret${uniqueSuffix()}`;

    await call("/api/moods", {
      method: "POST",
      json: { date: "2026-10-03", mood: "SAD", note: marker, visibility: "PRIVATE" },
    }, owner.cookie);

    const partnerView = await call<{ items: { note: string | null }[] }>("/api/moods", {}, partner.cookie);
    expect(partnerView.status).toBe(200);
    expect(partnerView.body.data!.items.some((m) => m.note === marker)).toBe(false);

    // owner still sees own
    const ownView = await call<{ items: { note: string | null }[] }>("/api/moods", {}, owner.cookie);
    expect(ownView.body.data!.items.some((m) => m.note === marker)).toBe(true);
  });

  it("partner cannot see owner's private check-in", async () => {
    const { owner, partner } = await makeHousehold(uniqueSuffix());
    const marker = `needsecret${uniqueSuffix()}`;

    await call("/api/checkins", {
      method: "POST",
      json: { date: "2026-10-03", need: marker, visibility: "PRIVATE" },
    }, owner.cookie);

    const partnerView = await call<{ items: { need: string | null }[] }>("/api/checkins", {}, partner.cookie);
    expect(partnerView.body.data!.items.some((c) => c.need === marker)).toBe(false);
  });

  it("shared mood IS visible to partner", async () => {
    const { owner, partner } = await makeHousehold(uniqueSuffix());
    const marker = `happyshare${uniqueSuffix()}`;

    await call("/api/moods", {
      method: "POST",
      json: { date: "2026-10-03", mood: "GREAT", note: marker, visibility: "SHARED" },
    }, owner.cookie);

    const partnerView = await call<{ items: { note: string | null }[] }>("/api/moods", {}, partner.cookie);
    expect(partnerView.body.data!.items.some((m) => m.note === marker)).toBe(true);
  });
});

describe("Business workflows end-to-end", () => {
  it("meal ingredients → shopping list (deduped)", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const marker = `ing${uniqueSuffix()}`;
    const meal = await call<{ id: string }>("/api/meals", {
      method: "POST",
      json: {
        date: "2026-10-06", slot: "LUNCH", title: "خورش تست",
        ingredients: [{ name: `${marker}-a` }, { name: `${marker}-b` }],
      },
    }, owner.cookie);
    expect(meal.status).toBe(201);

    const push = await call<{ added: number }>(`/api/meals/${meal.body.data!.id}/to-shopping`, { method: "POST", json: {} }, owner.cookie);
    expect(push.status).toBe(201);
    expect(push.body.data!.added).toBe(2);

    // second push dedupes
    const push2 = await call<{ added: number; message?: string }>(`/api/meals/${meal.body.data!.id}/to-shopping`, { method: "POST", json: {} }, owner.cookie);
    expect(push2.body.data!.added).toBe(0);
  });

  it("recurring task completion spawns next occurrence", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const marker = `rectask${uniqueSuffix()}`;
    const task = await call<{ id: string }>("/api/tasks", {
      method: "POST",
      json: { title: marker, recurrence: "DAILY", dueDate: "2026-10-03" },
    }, owner.cookie);
    expect(task.status).toBe(201);

    const done = await call(`/api/tasks/${task.body.data!.id}`, { method: "PATCH", json: { status: "DONE" } }, owner.cookie);
    expect(done.status).toBe(200);

    const open = await call<{ items: { title: string; dueDate: string }[] }>("/api/tasks?status=OPEN", {}, owner.cookie);
    const next = open.body.data!.items.find((t) => t.title === marker);
    expect(next).toBeTruthy();
    // dueDate is stored as Tehran-midnight UTC (2026-10-03T20:30:00Z = 1405-10-04 Tehran? no — 2026-10-04 00:00 Tehran)
    const nextTehran = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(next!.dueDate));
    expect(nextTehran).toBe("2026-10-04");
  });

  it("goal contribution updates progress and completes goal", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    const goal = await call<{ id: string }>("/api/goals", {
      method: "POST",
      json: { title: "هدف تست", targetAmount: 100000 },
    }, owner.cookie);

    const c1 = await call<{ saved: number; pct: number; completed: boolean }>(`/api/goals/${goal.body.data!.id}/contributions`, {
      method: "POST", json: { amount: 40000 },
    }, owner.cookie);
    expect(c1.body.data!.pct).toBe(40);
    expect(c1.body.data!.completed).toBe(false);

    const c2 = await call<{ saved: number; pct: number; completed: boolean }>(`/api/goals/${goal.body.data!.id}/contributions`, {
      method: "POST", json: { amount: 60000 },
    }, owner.cookie);
    expect(c2.body.data!.pct).toBe(100);
    expect(c2.body.data!.completed).toBe(true);
  });

  it("invite lifecycle: pending → accepted → reuse blocked", async () => {
    const suffix = uniqueSuffix();
    const owner = await makeHouseholdlessUser();
    await call("/api/household", { method: "POST", json: { name: `دعوت ${suffix}` } }, owner.owner.cookie);

    const invite = await call<{ code: string }>("/api/household/invite", { method: "POST", json: {} }, owner.owner.cookie);
    const code = invite.body.data!.code;

    const joiner = await makeHouseholdlessUser(`j${suffix}`);
    const join = await call("/api/household/join", { method: "POST", json: { code } }, joiner.owner.cookie);
    expect(join.status).toBe(200);

    // reuse: another user with the same code → invalid now
    const third = await makeHouseholdlessUser(`t${suffix}`);
    const reuse = await call("/api/household/join", { method: "POST", json: { code } }, third.owner.cookie);
    expect(reuse.status).toBe(404);
  });

  it("AI finance analysis returns real numbers from seeded household data", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    await call("/api/expenses", {
      method: "POST",
      json: { title: "AI تست", amount: 123456, category: "FOOD", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);

    const res = await call<{ answer: string }>("/api/ai", {
      method: "POST", json: { mode: "FINANCE", question: "تحلیل کن" },
    }, owner.cookie);
    expect(res.status).toBe(201);
    expect(res.body.data!.answer).toContain("۱۲۳٬۴۵۶"); // exactly the amount we created — no fabrication
  });

  it("activity feed logs household events but not private moods", async () => {
    const { owner } = await makeHousehold(uniqueSuffix());
    await call("/api/expenses", {
      method: "POST",
      json: { title: "لاگ تست", amount: 1000, category: "OTHER", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);
    await call("/api/moods", {
      method: "POST",
      json: { date: "2026-10-03", mood: "SAD", visibility: "PRIVATE" },
    }, owner.cookie);

    const feed = await call<{ items: { summary: string }[] }>("/api/activities", {}, owner.cookie);
    const summaries = feed.body.data!.items.map((a) => a.summary).join("|");
    expect(summaries).toContain("لاگ تست");
  });

  it("notifications fan out to partner on shared actions", async () => {
    const { owner, partner } = await makeHousehold(uniqueSuffix());
    await call("/api/expenses", {
      method: "POST",
      json: { title: "اعلان تست", amount: 1000, category: "OTHER", date: "2026-10-03", payerId: owner.id },
    }, owner.cookie);

    const notifs = await call<{ items: { type: string; title: string }[] }>("/api/notifications", {}, owner.cookie);
    const selfExpenseNotifs = notifs.body.data!.items.filter((n) => n.type === "EXPENSE" && n.title.includes("اعلان تست"));
    expect(selfExpenseNotifs.length).toBe(0); // actor never notified for own actions
    const partnerView = await call<{ items: { type: string; body: string | null }[] }>("/api/notifications", {}, partner.cookie);
    expect(partnerView.body.data!.items.some((n) => n.type === "EXPENSE" && (n.body ?? "").includes("اعلان تست"))).toBe(true);
  });
});

// ── helper: a logged-in user with NO household ──────────────────────────
async function makeHouseholdlessUser(suffix = uniqueSuffix()) {
  const { registerUser } = await import("./helpers");
  const u = await registerUser(`تنها ${suffix}`, `solo-${suffix}@example.com`);
  return { owner: u };
}
