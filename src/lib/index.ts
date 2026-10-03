import { tzOffsetMinutes, jalaliPartsInTz } from "./jalali";

export * from "./fa";
export * from "./jalali";
export { tzOffsetMinutes } from "./jalali";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO date (YYYY-MM-DD) of a Date in a timezone — no library. */
export function isoDateInTz(date: Date, tz = "Asia/Tehran"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(date);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function startOfDayUtcFromIso(iso: string, tz = "Asia/Tehran"): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Tehran has no DST since 2022; fixed +03:30. Use offset probing anyway.
  const off = tzOffsetMinutes(tz, new Date(guess));
  return new Date(guess - off * 60000);
}

export function endOfDayUtcFromIso(iso: string, tz = "Asia/Tehran"): Date {
  const start = startOfDayUtcFromIso(iso, tz);
  return new Date(start.getTime() + 24 * 3600000 - 1);
}

// ── Life Hub domain maps (central, single source of truth) ──────────────

export const EXPENSE_CATEGORIES = [
  "FOOD", "HOME", "TRANSPORT", "FUN", "SHOPPING",
  "MEDICAL", "BILLS", "TRAVEL", "CLOTHES", "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_FA: Record<string, string> = {
  FOOD: "خوراک", HOME: "خانه", TRANSPORT: "حمل‌ونقل", FUN: "تفریح",
  SHOPPING: "خرید", MEDICAL: "درمان", BILLS: "قبض", TRAVEL: "سفر",
  CLOTHES: "پوشاک", OTHER: "سایر",
};

export const CATEGORY_EMOJI: Record<string, string> = {
  FOOD: "🍽️", HOME: "🏠", TRANSPORT: "🚕", FUN: "🎬",
  SHOPPING: "🛍️", MEDICAL: "💊", BILLS: "🧾", TRAVEL: "✈️",
  CLOTHES: "👕", OTHER: "📦",
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_FA: Record<string, string> = {
  LOW: "کم", NORMAL: "عادی", HIGH: "زیاد",
};

export const RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_FA: Record<string, string> = {
  NONE: "بدون تکرار", DAILY: "روزانه", WEEKLY: "هفتگی", MONTHLY: "ماهانه", CUSTOM: "سفارشی",
};

export const SHOP_CATEGORIES = [
  "GROCERY", "PRODUCE", "DAIRY", "MEAT", "HOUSEHOLD",
  "PERSONAL", "CLEANING", "OTHER",
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_CATEGORY_FA: Record<string, string> = {
  GROCERY: "خواربار", PRODUCE: "میوه و سبزیجات", DAIRY: "لبنیات",
  MEAT: "گوشت و پروتئین", HOUSEHOLD: "لوازم خانه", PERSONAL: "شخصی",
  CLEANING: "شوینده", OTHER: "سایر",
};

export const EVENT_KINDS = [
  "PERSONAL", "SHARED", "APPOINTMENT", "FAMILY", "DATE", "IMPORTANT",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_FA: Record<string, string> = {
  PERSONAL: "شخصی", SHARED: "مشترک", APPOINTMENT: "قرار",
  FAMILY: "خانوادگی", DATE: "دونفره", IMPORTANT: "مهم",
};

export const EVENT_KIND_EMOJI: Record<string, string> = {
  PERSONAL: "🙋", SHARED: "👥", APPOINTMENT: "📌", FAMILY: "👨‍👩‍👧", DATE: "💞", IMPORTANT: "❗",
};

export const REMINDERS = ["NONE", "AT_TIME", "1H", "3H", "1D", "1D_12H"] as const;
export type Reminder = (typeof REMINDERS)[number];

export const REMINDER_FA: Record<string, string> = {
  NONE: "بدون یادآور", AT_TIME: "سر وقت", "1H": "۱ ساعت قبل", "3H": "۳ ساعت قبل",
  "1D": "۱ روز قبل", "1D_12H": "۱ روز و ۱۲ ساعت قبل",
};

export const IMPORTANT_KINDS = ["BIRTHDAY", "ANNIVERSARY", "WEDDING", "CUSTOM"] as const;
export type ImportantKind = (typeof IMPORTANT_KINDS)[number];

export const IMPORTANT_KIND_FA: Record<string, string> = {
  BIRTHDAY: "تولد", ANNIVERSARY: "سالگرد آشنایی", WEDDING: "سالگرد ازدواج", CUSTOM: "مناسبت سفارشی",
};

export const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_FA: Record<string, string> = {
  BREAKFAST: "صبحانه", LUNCH: "ناهار", DINNER: "شام", SNACK: "میان‌وعده",
};

export const MOODS = ["GREAT", "GOOD", "NORMAL", "SAD", "ANGRY"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_FA: Record<string, string> = {
  GREAT: "عالی", GOOD: "خوب", NORMAL: "معمولی", SAD: "ناراحت", ANGRY: "عصبانی",
};

export const MOOD_EMOJI: Record<string, string> = {
  GREAT: "😊", GOOD: "🙂", NORMAL: "😐", SAD: "😔", ANGRY: "😡",
};

export const VISIBILITIES = ["PRIVATE", "SHARED"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_FA: Record<string, string> = {
  PRIVATE: "خصوصی", SHARED: "مشترک با همسر",
};

export const DATE_SETTINGS = ["INDOOR", "OUTDOOR", "ANY"] as const;
export type DateSetting = (typeof DATE_SETTINGS)[number];

export const DATE_SETTING_FA: Record<string, string> = {
  INDOOR: "خانگی", OUTDOOR: "بیرون", ANY: "فرقی ندارد",
};

export const NOTIF_TYPES = [
  "EXPENSE", "SHOPPING", "TASK", "EVENT", "REMINDER", "GOAL",
  "IMPORTANT_DATE", "INVITE", "ACTIVITY", "AI",
] as const;

export const NOTIF_TYPE_FA: Record<string, string> = {
  EXPENSE: "هزینه", SHOPPING: "خرید", TASK: "کار خانه", EVENT: "رویداد",
  REMINDER: "یادآور", GOAL: "هدف", IMPORTANT_DATE: "مناسبت", INVITE: "دعوت",
  ACTIVITY: "فعالیت", AI: "دستیار",
};

export const ACTIVITY_TYPE_FA: Record<string, string> = {
  EXPENSE_ADDED: "هزینه ثبت شد", EXPENSE_UPDATED: "هزینه ویرایش شد", EXPENSE_DELETED: "هزینه حذف شد",
  BUDGET_ADDED: "بودجه تعیین شد", BUDGET_UPDATED: "بودجه ویرایش شد",
  GOAL_ADDED: "هدف ساخته شد", GOAL_CONTRIB: "به هدف پس‌انداز شد", GOAL_COMPLETED: "هدف تکمیل شد",
  SHOPPING_ADDED: "به لیست خرید اضافه شد", SHOPPING_DONE: "خرید انجام شد",
  TASK_ADDED: "کار خانه ساخته شد", TASK_DONE: "کار خانه انجام شد",
  EVENT_ADDED: "رویداد ثبت شد", IMPORTANT_DATE_ADDED: "مناسبت ثبت شد",
  MEAL_ADDED: "برنامه غذایی ثبت شد", MEAL_TO_SHOPPING: "مواد لازم به لیست خرید اضافه شد",
  MOOD_ADDED: "حال‌وهوای امروز ثبت شد", CHECKIN_ADDED: "چک‌این روزانه ثبت شد",
  MEMORY_ADDED: "خاطره ثبت شد", DATE_IDEA_ADDED: "ایده قرار ثبت شد",
  HOUSEHOLD_CREATED: "خانواده ساخته شد", PARTNER_JOINED: "همسر به خانواده پیوست",
};

/** Central currency formatter — تومان ONLY, Persian digits, ٬ separators. */
export function faPrice(amount: number): string {
  const grouped = new Intl.NumberFormat("fa-IR").format(amount);
  return `${grouped} تومان`;
}

/** Grouped Persian number without unit (for counts/percent/progress). */
export function faCount(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

/** Percent with Persian digits, e.g. 35 → «۳۵٪». */
export function faPercent(n: number): string {
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(n)}٪`;
}

/** Jalali month key like 1405-07 for budgets. */
export function jalaliMonthKey(date = new Date()): string {
  const p = jalaliPartsInTz(date, "Asia/Tehran");
  return `${p.jy}-${pad2(p.jm)}`;
}
