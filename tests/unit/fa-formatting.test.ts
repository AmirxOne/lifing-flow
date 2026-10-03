import { describe, it, expect } from "vitest";
import { faNum, faStr, toEnDigits, faPad2, faInt, withRtlMark, stripBidiMarks } from "@/lib/fa";
import { faPrice, faCount, faPercent, jalaliMonthKey, cn, pad2, startOfDayUtcFromIso, endOfDayUtcFromIso, isoDateInTz, addDays } from "@/lib";

describe("Persian digit formatting (LAW: اعداد همیشه فارسی)", () => {
  it("faNum converts latin digits to Persian", () => {
    expect(faNum("123456")).toBe("۱۲۳۴۵۶");
    expect(faNum(0)).toBe("۰");
    expect(faNum(987654321)).toBe("۹۸۷۶۵۴۳۲۱");
  });

  it("faNum keeps non-digits untouched", () => {
    expect(faNum("abc-123")).toBe("abc-۱۲۳");
  });

  it("faStr converts digits inside mixed text", () => {
    expect(faStr("هزینه 25000 تومان")).toBe("هزینه ۲۵۰۰۰ تومان");
  });

  it("toEnDigits converts Persian AND Arabic-Indic digits back", () => {
    expect(toEnDigits("۱۲۳۴۵۶")).toBe("123456");
    expect(toEnDigits("١٢٣٤٥٦")).toBe("123456");
  });

  it("round-trip: faNum then toEnDigits", () => {
    expect(toEnDigits(faNum(777))).toBe("777");
  });

  it("faPad2 pads single digits", () => {
    expect(faPad2(3)).toBe("۰۳");
    expect(faPad2(15)).toBe("۱۵");
  });

  it("faInt groups thousands with Persian separators", () => {
    expect(faInt(1500000)).toBe("۱٬۵۰۰٬۰۰۰");
    expect(faInt(999)).toBe("۹۹۹");
  });

  it("withRtlMark pins LTR runs once", () => {
    expect(withRtlMark("abc")).toBe("\u200Fabc");
    expect(withRtlMark("\u200Fabc")).toBe("\u200Fabc");
  });

  it("stripBidiMarks removes all bidi control chars", () => {
    expect(stripBidiMarks("\u200Fabc\u200E\u202Ad")).toBe("abcd");
  });
});

describe("Currency formatting (LAW: پول همیشه تومان)", () => {
  it("faPrice appends تومان with Persian grouping", () => {
    expect(faPrice(1500000)).toBe("۱٬۵۰۰٬۰۰۰ تومان");
  });

  it("faPrice(0) renders zero", () => {
    expect(faPrice(0)).toBe("۰ تومان");
  });

  it("faCount groups without unit", () => {
    expect(faCount(12345)).toBe("۱۲٬۳۴۵");
  });

  it("faPercent renders Persian percent", () => {
    expect(faPercent(35)).toBe("۳۵٪");
    expect(faPercent(33.33333)).toBe("۳۳٫۳٪");
  });

  it("never contains latin digits (sample sweep)", () => {
    for (const n of [0, 5, 50, 999, 1000, 123456, 987654321]) {
      expect(faPrice(n)).not.toMatch(/[0-9]/);
      expect(faCount(n)).not.toMatch(/[0-9]/);
    }
  });
});

describe("date helpers", () => {
  it("isoDateInTz returns YYYY-MM-DD in Tehran", () => {
    // 2026-10-03 12:00 UTC → same day in Tehran (+3:30)
    expect(isoDateInTz(new Date("2026-10-03T12:00:00Z"))).toBe("2026-10-03");
    // 2026-10-03 22:00 UTC → 2026-10-04 01:30 Tehran
    expect(isoDateInTz(new Date("2026-10-03T22:00:00Z"))).toBe("2026-10-04");
  });

  it("startOfDayUtcFromIso maps to Tehran midnight", () => {
    const d = startOfDayUtcFromIso("2026-10-03");
    expect(d.toISOString()).toBe("2026-10-02T20:30:00.000Z");
  });

  it("endOfDayUtcFromIso is one ms before next day start", () => {
    const end = endOfDayUtcFromIso("2026-10-03");
    const nextStart = startOfDayUtcFromIso("2026-10-04");
    expect(nextStart.getTime() - end.getTime()).toBe(1);
  });

  it("addDays crosses months", () => {
    const d = addDays(new Date(2026, 9, 31), 1);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(1);
  });

  it("jalaliMonthKey returns current Persian month key", () => {
    // 2026-10-03 → 1405-07
    const key = jalaliMonthKey(new Date("2026-10-03T12:00:00Z"));
    expect(key).toBe("1405-07");
  });

  it("pad2 zero-pads", () => {
    expect(pad2(1)).toBe("01");
    expect(pad2(12)).toBe("12");
  });
});

describe("cn class joiner", () => {
  it("joins truthy parts", () => {
    expect(cn("a", false, null, "b", undefined, "c")).toBe("a b c");
  });
});
