import { describe, it, expect } from "vitest";
import {
  toJalali, toGregorian, jMonthLen, isJalaliLeap, jMonthGrid,
  jalaliPartsInTz, J_MONTHS, J_WEEKDAYS_LONG,
} from "@/lib/jalali";

describe("Jalali calendar core", () => {
  it("toJalali converts known date: 2026-10-03 → 1405-07-11", () => {
    const j = toJalali(new Date(2026, 9, 3));
    expect(j).toEqual({ jy: 1405, jm: 7, jd: 11 });
  });

  it("toJalali handles Nowruz edge: 2026-03-21 → 1405-01-01", () => {
    const j = toJalali(new Date(2026, 2, 21));
    expect(j.jy).toBe(1405);
    expect(j.jm).toBe(1);
    expect(j.jd).toBe(1);
  });

  it("toGregorian round-trips with toJalali", () => {
    for (const [y, m, d] of [[2026, 1, 1], [2026, 6, 15], [2026, 12, 31], [2027, 3, 20]] as const) {
      const g = new Date(y, m - 1, d);
      const back = toGregorian(toJalali(g).jy, toJalali(g).jm, toJalali(g).jd);
      expect(back.getFullYear()).toBe(y);
      expect(back.getMonth()).toBe(m - 1);
      expect(back.getDate()).toBe(d);
    }
  });

  it("first 6 months have 31 days", () => {
    for (let m = 1; m <= 6; m++) expect(jMonthLen(1405, m)).toBe(31);
  });

  it("months 7-11 have 30 days", () => {
    for (let m = 7; m <= 11; m++) expect(jMonthLen(1405, m)).toBe(30);
  });

  it("isJalaliLeap matches known leap years (1403 leap, 1405 not)", () => {
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1405)).toBe(false);
  });

  it("jMonthGrid has 7-col aligned cells covering the month", () => {
    const grid = jMonthGrid(1405, 7);
    expect(grid.length % 7).toBe(0);
    const days = grid.filter((c) => c !== null) as { jd: number }[];
    expect(days.length).toBe(30);
    expect(days[0].jd).toBe(1);
    expect(days[days.length - 1].jd).toBe(30);
  });

  it("jMonthGrid offset matches weekday of day 1 (Mehr 1 1405 = Wednesday → 4 leading blanks)", () => {
    const grid = jMonthGrid(1405, 7);
    const firstIdx = grid.findIndex((c) => c !== null);
    expect(firstIdx).toBe(4);
  });

  it("grid weekday column of day 1 matches toGregorian().getDay() (Saturday=col 0)", () => {
    for (const [jy, jm] of [[1405, 1], [1405, 7], [1404, 12], [1403, 12]] as const) {
      const grid = jMonthGrid(jy, jm);
      const firstIdx = grid.findIndex((c) => c !== null);
      const g = toGregorian(jy, jm, 1);
      expect(firstIdx).toBe((g.getDay() + 1) % 7);
    }
  });

  it("jalaliPartsInTz respects Tehran timezone", () => {
    // 2026-10-03 22:00 UTC is already 2026-10-04 in Tehran
    const p = jalaliPartsInTz(new Date("2026-10-03T22:00:00Z"), "Asia/Tehran");
    expect(p.jd).toBe(12);
    const p2 = jalaliPartsInTz(new Date("2026-10-03T10:00:00Z"), "Asia/Tehran");
    expect(p2.jd).toBe(11);
  });

  it("month/weekday label arrays are complete", () => {
    expect(J_MONTHS.length).toBe(12);
    expect(J_WEEKDAYS_LONG.length).toBe(7);
    expect(J_MONTHS[6]).toBe("مهر");
  });
});
