import { describe, it, expect } from "vitest";
import {
  toISODate,
  isISODate,
  parseISO,
  addDays,
  addMonths,
  addMonthsClamped,
  startOfWeek,
  endOfWeek,
  weekDates,
  sameWeek,
  weekOfYear,
  startOfMonth,
  endOfMonth,
  monthMatrix,
  isoDateFromMillis,
  formatDayLabel,
  formatShortDay,
  formatDaySpan,
  daySpanIndex,
  daySpanLength,
  formatWeekLabel,
  formatMonthTitle,
  formatMonthDayHeading,
} from "../src/dates.js";

describe("ISO 변환", () => {
  it("toISODate / parseISO 왕복", () => {
    expect(toISODate(new Date(2026, 8, 7))).toBe("2026-09-07");
    expect(toISODate(parseISO("2026-01-03"))).toBe("2026-01-03");
  });

  it("isISODate", () => {
    expect(isISODate("2026-09-07")).toBe(true);
    expect(isISODate("2026-9-7")).toBe(false);
    expect(isISODate("2026-02-30")).toBe(false); // 존재하지 않는 날짜
    expect(isISODate("2026/09/07")).toBe(false);
    expect(isISODate(20260907)).toBe(false);
  });

  it("isoDateFromMillis", () => {
    expect(isoDateFromMillis(new Date(2025, 0, 15, 9, 0).getTime())).toBe(
      "2025-01-15"
    );
    expect(isoDateFromMillis(NaN)).toBe(null);
  });
});

describe("일/주/월 이동", () => {
  it("addDays", () => {
    expect(addDays("2026-09-07", 1)).toBe("2026-09-08");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addMonths (연/월만)", () => {
    expect(addMonths(2026, 8, 1)).toEqual({ year: 2026, month: 9 });
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("addMonthsClamped (일자 유지, 없으면 말일)", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("주 (일요일 시작)", () => {
  // 2026-09-07 = 월요일 → 그 주 일요일 09-06, 토요일 09-12
  it("startOfWeek / endOfWeek", () => {
    expect(startOfWeek("2026-09-07")).toBe("2026-09-06");
    expect(startOfWeek("2026-09-06")).toBe("2026-09-06");
    expect(endOfWeek("2026-09-07")).toBe("2026-09-12");
  });

  it("weekDates는 일~토 7일", () => {
    expect(weekDates("2026-09-09")).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("sameWeek", () => {
    expect(sameWeek("2026-09-06", "2026-09-12")).toBe(true);
    expect(sameWeek("2026-09-12", "2026-09-13")).toBe(false);
  });

  it("weekOfYear (일요일 기준 연중 주차, 1/1 포함 주 = 1)", () => {
    expect(weekOfYear("2026-01-01")).toBe(1);
    expect(weekOfYear("2026-01-04")).toBe(2); // 다음 일요일
    expect(weekOfYear("2026-09-06")).toBe(37);
    expect(weekOfYear("2026-09-12")).toBe(37); // 같은 주
    expect(weekOfYear("2026-09-13")).toBe(38);
  });
});

describe("월", () => {
  it("startOfMonth / endOfMonth", () => {
    expect(startOfMonth("2026-09-15")).toBe("2026-09-01");
    expect(endOfMonth("2026-09-15")).toBe("2026-09-30");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("monthMatrix: 6주 × (일 시작), inMonth 플래그", () => {
    const m = monthMatrix(2026, 8); // 9월
    expect(m).toHaveLength(6);
    expect(m.every((w) => w.length === 7)).toBe(true);
    expect(parseISO(m[0][0].iso).getDay()).toBe(0); // 첫 칸은 일요일
    expect(m[0][0].inMonth).toBe(false); // 8월 마지막 날들
    const sep7 = m.flat().find((c) => c.iso === "2026-09-07");
    expect(sep7.inMonth).toBe(true);
  });
});

describe("포맷터", () => {
  it("formatDayLabel", () => {
    expect(formatDayLabel("2026-09-07", "2026-09-07")).toBe(
      "오늘 · 9월 7일 (월)"
    );
    expect(formatDayLabel("2026-09-08", "2026-09-07")).toBe("9월 8일 (화)");
  });

  it("formatWeekLabel", () => {
    expect(formatWeekLabel("2026-09-09")).toBe("9월 6일 – 9월 12일");
  });

  it("formatMonthTitle", () => {
    expect(formatMonthTitle(2026, 8)).toBe("2026년 9월");
  });

  it("formatMonthDayHeading", () => {
    expect(formatMonthDayHeading("2026-09-07", "2026-09-07")).toBe(
      "9월 7일 (월) · 오늘"
    );
    expect(formatMonthDayHeading("2026-09-08", "2026-09-07")).toBe(
      "9월 8일 (화)"
    );
  });

  it("formatShortDay", () => {
    expect(formatShortDay("2026-09-07", "2026-09-07")).toBe("오늘");
    expect(formatShortDay("2026-09-08", "2026-09-07")).toBe("9/8 (화)");
    expect(formatShortDay("2026-12-25", "2026-09-07")).toBe("12/25 (금)");
  });

  it("formatDaySpan / daySpanIndex / daySpanLength", () => {
    expect(formatDaySpan("2026-09-08", "2026-09-10", "2026-09-01")).toBe(
      "9/8–9/10"
    );
    // endDate 없거나 이하면 단일 날짜
    expect(formatDaySpan("2026-09-08", "", "2026-09-08")).toBe("오늘");
    expect(formatDaySpan("2026-09-08", "2026-09-07", "2026-09-01")).toBe(
      "9/8 (화)"
    );
    expect(daySpanIndex("2026-09-08", "2026-09-09")).toBe(2);
    expect(daySpanIndex("2026-09-08", "2026-09-08")).toBe(1);
    expect(daySpanIndex("2026-09-08", "2026-09-07")).toBe(0);
    expect(daySpanLength("2026-09-08", "2026-09-10")).toBe(3);
    expect(daySpanLength("2026-09-08", "")).toBe(1);
  });
});
