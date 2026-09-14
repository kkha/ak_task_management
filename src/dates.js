"use strict";

/* ──────────────────────────────────────────────────────────────
 * 날짜 헬퍼. 전부 로컬 타임존 기준, 순수 함수(부수효과 없음).
 * 날짜는 "YYYY-MM-DD" ISO 문자열로 주고받는다. zero-padding 되므로
 * 문자열 비교(a <= b)가 곧 날짜 비교다 — 주 범위 필터에서 이를 쓴다.
 *
 * 월(month)은 JS Date와 동일하게 0-indexed (0 = 1월).
 * 주(week)의 시작은 일요일이다.
 * ────────────────────────────────────────────────────────────── */

export const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** 주가 시작하는 요일. 0 = 일요일. */
export const WEEK_START = 0;

/** 한 자리 수를 2자리로 zero-pad. */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Date → "YYYY-MM-DD" (로컬). */
export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" 형식이면서 실재하는 날짜인지. */
export function isISODate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return !Number.isNaN(d.getTime()) && toISODate(d) === s;
}

/** 오늘 날짜 ISO. */
export function todayISODate() {
  return toISODate(new Date());
}

/** epoch ms → "YYYY-MM-DD" (로컬). 유효하지 않으면 null. */
export function isoDateFromMillis(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return toISODate(new Date(ms));
}

/** "YYYY-MM-DD" → 로컬 자정 Date. */
export function parseISO(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** iso 기준 n일 뒤(음수면 앞). */
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** {year, month(0-idx)} 기준 n개월 뒤. */
export function addMonths(year, month, n) {
  const d = new Date(year, month + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** iso가 속한 주의 일요일. */
export function startOfWeek(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() - WEEK_START + 7) % 7));
  return toISODate(d);
}

/** iso가 속한 주의 토요일. */
export function endOfWeek(iso) {
  return addDays(startOfWeek(iso), 6);
}

/** iso가 속한 주의 7일(일~토). */
export function weekDates(iso) {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * 연중 주차. 일요일 기준(이 앱의 주와 일치).
 * 1월 1일이 포함된 일~토 주가 1주차.
 */
export function weekOfYear(iso) {
  const d = parseISO(startOfWeek(iso));
  const year = parseISO(iso).getFullYear();
  const firstSun = parseISO(startOfWeek(toISODate(new Date(year, 0, 1))));
  return Math.round((d - firstSun) / (7 * 86400000)) + 1;
}

/** iso가 속한 달의 1일. */
export function startOfMonth(iso) {
  const d = parseISO(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** iso가 속한 달의 말일. */
export function endOfMonth(iso) {
  const d = parseISO(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** iso 기준 n개월 뒤. 같은 일자를 유지하되 그 달에 없으면 말일로 클램프. */
export function addMonthsClamped(iso, n) {
  const d = parseISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toISODate(target);
}

/** 두 날짜가 같은 주(일~토)에 속하는지. */
export function sameWeek(a, b) {
  return startOfWeek(a) === startOfWeek(b);
}

/** iso가 주어진 year/month(0-idx)에 속하는지. */
export function isSameMonth(iso, year, month) {
  const d = parseISO(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

/**
 * 달력 그리드. 항상 일요일 시작, 6주 × 7일.
 * @returns {{iso: string, inMonth: boolean}[][]}
 */
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const gridStart = parseISO(startOfWeek(toISODate(first)));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(gridStart);
      cur.setDate(gridStart.getDate() + w * 7 + d);
      row.push({ iso: toISODate(cur), inMonth: cur.getMonth() === month });
    }
    weeks.push(row);
  }
  return weeks;
}

/* ── 표시용 포맷터 ─────────────────────────────────────────── */

/** "9월 7일 (일)" / 오늘이면 "오늘 · 9월 7일 (일)". */
export function formatDayLabel(iso, todayIso = todayISODate()) {
  const d = parseISO(iso);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_NAMES[d.getDay()]})`;
  return iso === todayIso ? `오늘 · ${base}` : base;
}

/** 아젠다 그룹 헤더용. "9월 7일 (일)" / 오늘이면 "9월 7일 (일) · 오늘". */
export function formatMonthDayHeading(iso, todayIso = todayISODate()) {
  const d = parseISO(iso);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_NAMES[d.getDay()]})`;
  return iso === todayIso ? `${base} · 오늘` : base;
}

/** 목록 행의 날짜 뱃지용. "오늘" / "9/8 (화)". */
export function formatShortDay(iso, todayIso = todayISODate()) {
  if (iso === todayIso) return "오늘";
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_NAMES[d.getDay()]})`;
}

/** 여러 날 항목의 날짜 뱃지. "9/8 (화)" 또는 "9/8–9/10". */
export function formatDaySpan(startIso, endIso, todayIso = todayISODate()) {
  if (!isISODate(endIso) || endIso <= startIso) {
    return formatShortDay(startIso, todayIso);
  }
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  return `${s.getMonth() + 1}/${s.getDate()}–${e.getMonth() + 1}/${e.getDate()}`;
}

/** span 안에서 iso가 며칠째인지(1-기준). 범위 밖이면 0. */
export function daySpanIndex(startIso, iso) {
  if (iso < startIso) return 0;
  return Math.round((parseISO(iso) - parseISO(startIso)) / 86400000) + 1;
}

/** span의 전체 일수(포함). endIso 없으면 1. */
export function daySpanLength(startIso, endIso) {
  if (!isISODate(endIso) || endIso <= startIso) return 1;
  return daySpanIndex(startIso, endIso);
}

/** "9월 7일 – 9월 13일" (iso가 속한 주). */
export function formatWeekLabel(iso) {
  const s = parseISO(startOfWeek(iso));
  const e = parseISO(endOfWeek(iso));
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}

/** "2026년 9월". */
export function formatMonthTitle(year, month) {
  return `${year}년 ${month + 1}월`;
}
