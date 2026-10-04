import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "Pass1234";

async function upsertUser(data: {
  email: string; fullName: string; avatarEmoji?: string; role?: string;
  householdName?: string; householdEmoji?: string;
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  let householdId: string | null = null;

  if (data.householdName) {
    const existing = await prisma.household.findFirst({ where: { name: data.householdName } });
    if (existing) {
      householdId = existing.id;
    } else {
      const hh = await prisma.household.create({
        data: { name: data.householdName, avatarEmoji: data.householdEmoji ?? "🏠" },
      });
      householdId = hh.id;
    }
  }

  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: {
      fullName: data.fullName,
      ...(householdId ? { householdId } : {}),
      onboardingDone: !!householdId || data.role === "SYSTEM_ADMIN",
      isActive: true,
    },
    create: {
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: data.role ?? "USER",
      avatarEmoji: data.avatarEmoji ?? null,
      householdId,
      onboardingDone: !!householdId || data.role === "SYSTEM_ADMIN",
    },
  });
  return user;
}

async function main() {
  console.log("Seeding Life Hub…");

  // Household A: owner + partner
  await upsertUser({
    email: "test-owner@example.com",
    fullName: "امیرحسین تست",
    avatarEmoji: "😎",
    householdName: "خانواده تست آ",
    householdEmoji: "🏠",
  });
  await upsertUser({
    email: "test-partner@example.com",
    fullName: "سارا تست",
    avatarEmoji: "🌸",
    householdName: "خانواده تست آ",
  });

  // Household B: fully separate (for isolation tests)
  await upsertUser({
    email: "test-other-household@example.com",
    fullName: "نیما خوانواده دوم",
    avatarEmoji: "🦁",
    householdName: "خانواده تست ب",
    householdEmoji: "🌿",
  });

  // Solo owner for invite-flow E2E (household of one — waiting for partner)
  await upsertUser({
    email: "test-inviter@example.com",
    fullName: "دعوت‌کننده تست",
    avatarEmoji: "💌",
    householdName: "خانواده دعوت",
    householdEmoji: "💌",
  });

  // System admin (no household)
  await upsertUser({
    email: "test-admin@example.com",
    fullName: "مدیر سیستم",
    role: "SYSTEM_ADMIN",
    avatarEmoji: "🛡️",
  });

  // ── sample data for household A ──
  const owner = await prisma.user.findUnique({ where: { email: "test-owner@example.com" } });
  const partner = await prisma.user.findUnique({ where: { email: "test-partner@example.com" } });
  if (!owner?.householdId || !owner || !partner) throw new Error("seed users missing");
  const hhId = owner.householdId;

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);

  // expenses
  const expenseData = [
    { title: "خرید هفتگی سوپرمارکت", amount: 1_850_000, category: "FOOD", payerId: owner.id, days: 0 },
    { title: "تاکسی", amount: 95_000, category: "TRANSPORT", payerId: partner.id, days: 0 },
    { title: "قبض برق", amount: 420_000, category: "BILLS", payerId: owner.id, days: 2 },
    { title: "سینما", amount: 300_000, category: "FUN", payerId: partner.id, days: 3 },
    { title: "میوه", amount: 260_000, category: "FOOD", payerId: owner.id, days: 4 },
    { title: "داروخانه", amount: 180_000, category: "MEDICAL", payerId: partner.id, days: 6 },
  ];
  for (const e of expenseData) {
    await prisma.expense.upsert({
      where: { id: `${hhId}-seed-${e.days}-${e.title}` },
      update: {},
      create: {
        householdId: hhId,
        title: e.title,
        amount: e.amount,
        category: e.category,
        date: daysAgo(e.days),
        payerId: e.payerId,
        isShared: true,
        createdBy: e.payerId,
      },
    }).catch(() => {}); // deterministic ids via catch — createMany fallback not needed
  }

  // budget for current month
  const { jalaliPartsInTz } = await import("../src/lib/jalali");
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  const p = jalaliPartsInTz(now, "Asia/Tehran");
  const month = `${p.jy}-${pad2(p.jm)}`;
  await prisma.budget.upsert({
    where: { householdId_category_month: { householdId: hhId, category: "FOOD", month } },
    update: {},
    create: { householdId: hhId, category: "FOOD", amount: 10_000_000, month },
  });

  // goal + contribution
  const goal = await prisma.goal.upsert({
    where: { id: `${hhId}-seed-goal` },
    update: {},
    create: {
      id: `${hhId}-seed-goal`,
      householdId: hhId,
      title: "سفر شمال تابستان",
      targetAmount: 100_000_000,
      deadline: new Date(now.getFullYear(), now.getMonth() + 5, now.getDate()),
    },
  });
  const contribCount = await prisma.goalContribution.count({ where: { goalId: goal.id } });
  if (contribCount === 0) {
    await prisma.goalContribution.create({
      data: { goalId: goal.id, userId: owner.id, amount: 35_000_000 },
    });
  }

  // shopping
  const shopItems = [
    { title: "شیر", quantity: "۲", category: "DAIRY", priority: "NORMAL" },
    { title: "نان", quantity: "۱", category: "GROCERY", priority: "HIGH" },
    { title: "پودر لباسشویی", quantity: "۱", category: "CLEANING", priority: "LOW" },
  ];
  for (const s of shopItems) {
    const exists = await prisma.shoppingItem.findFirst({ where: { householdId: hhId, title: s.title } });
    if (!exists) {
      await prisma.shoppingItem.create({
        data: { householdId: hhId, ...s, addedById: owner.id },
      });
    }
  }

  // tasks (incl. recurring)
  const taskDefs = [
    { title: "ظرف‌ها", recurrence: "DAILY", dueInDays: 0, assignedToId: partner.id },
    { title: "جارو کردن", recurrence: "WEEKLY", dueInDays: 2, assignedToId: owner.id },
    { title: "قرار با تعمیرکار", recurrence: "NONE", dueInDays: 1, assignedToId: null as string | null },
  ];
  for (const t of taskDefs) {
    const exists = await prisma.task.findFirst({ where: { householdId: hhId, title: t.title } });
    if (!exists) {
      await prisma.task.create({
        data: {
          householdId: hhId,
          title: t.title,
          recurrence: t.recurrence,
          dueDate: daysAgo(-t.dueInDays),
          assignedToId: t.assignedToId,
        },
      });
    }
  }

  // event
  const evExists = await prisma.eventModel.findFirst({ where: { householdId: hhId, title: "شام دونفره" } });
  if (!evExists) {
    await prisma.eventModel.create({
      data: {
        householdId: hhId,
        title: "شام دونفره",
        date: daysAgo(-1),
        startTime: "20:00",
        kind: "DATE",
        location: "رستوران نزدیک خانه",
      },
    });
  }

  // memory
  const memExists = await prisma.memory.findFirst({ where: { householdId: hhId, title: "اولین سفر مشترک" } });
  if (!memExists) {
    await prisma.memory.create({
      data: {
        householdId: hhId,
        title: "اولین سفر مشترک",
        description: "سفر سه‌روزه به ماسوله — باران و چای و خنده.",
        date: daysAgo(45),
        tags: ["سفر", "ماسوله"],
        createdById: owner.id,
      },
    });
  }

  console.log("Seed complete:");
  console.log("  test-owner@example.com / test-partner@example.com → خانواده تست آ");
  console.log("  test-other-household@example.com → خانواده تست ب (جدا)");
  console.log("  test-admin@example.com → SYSTEM_ADMIN");
  console.log(`  همه با رمز: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
