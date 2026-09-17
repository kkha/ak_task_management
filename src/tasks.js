"use strict";

import {
  todayISODate,
  isISODate,
  isoDateFromMillis,
  parseISO,
  addDays,
  startOfWeek,
  endOfWeek,
} from "./dates.js";

/* ──────────────────────────────────────────────────────────────
 * 순수 도메인 로직. DOM·localStorage·전역 상태에 의존하지 않는다.
 * 모든 함수는 입력을 변형(mutate)하지 않고 새 값을 반환한다.
 * ────────────────────────────────────────────────────────────── */

/** 고정 카테고리 3종. 이 집합은 PRD·저장 스키마상 고정이다. */
export const CATEGORIES = ["개인", "업무", "공부"];

/** 필터 값: 전체 + 카테고리. */
export const FILTERS = ["전체", ...CATEGORIES];

/**
 * 할 일이 속한 기간 단위.
 * - "day"  : 특정 날짜의 할 일 (기본값, 예전 데이터는 scope 없음 = day)
 * - "week" : 그 주 전체의 계획 (일별 보기에는 안 뜸)
 * - "month": 그 달 전체의 계획 (일별·주별 보기에는 안 뜸)
 * `date`는 세 경우 모두 유효한 "YYYY-MM-DD" — week/month는 그 주/달 안의 기준일.
 */
export const SCOPES = ["day", "week", "month"];

/** 예전 데이터(scope 없음)를 "day"로 취급. */
export const taskScope = (t) => (SCOPES.includes(t?.scope) ? t.scope : "day");

/**
 * 진행 상태. `completed`(frozen)가 done의 정본이고, 그 외에 "작업중"만 별도 표시한다.
 * - done  : t.completed === true
 * - doing : t.status === "doing" (완료 아님)
 * - todo  : 나머지
 */
export const STATUSES = ["todo", "doing", "done"];
export const taskStatus = (t) =>
  t?.completed ? "done" : t?.status === "doing" ? "doing" : "todo";

/** 우선순위. 기본 "normal", 저장은 high/low 일 때만. */
export const PRIORITIES = ["high", "normal", "low"];
export const taskPriority = (t) =>
  t?.priority === "high" || t?.priority === "low" ? t.priority : "normal";
const PRIO_RANK = { high: 0, normal: 1, low: 2 };

/** 반복 주기. */
export const RECUR_FREQS = ["daily", "weekdays", "weekly"];

/** 정렬 모드. "manual"은 배열 순서 그대로(드래그로 조정). */
export const SORT_MODES = [
  "manual",
  "priority",
  "date-asc",
  "created-desc",
  "created-asc",
  "category",
  "active-first",
];

export const SORT_LABELS = {
  manual: "수동 (드래그)",
  priority: "우선순위순",
  "date-asc": "날짜순",
  "created-desc": "최신순",
  "created-asc": "오래된순",
  category: "카테고리순",
  "active-first": "진행 우선",
};

/** 새 Task id. */
function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 새 Task를 만든다. 두 가지 호출을 받는다:
 *   createTask(text, "업무", "2026-09-08", "week")           // 위치 인자(하위호환)
 *   createTask(text, { category, date, scope, subcategory,   // 옵션 객체(권장)
 *                      priority, endDate, notes, recurrence, series })
 * 저장 스키마는 CLAUDE.md 참고 — 선택 필드는 기본값이면 넣지 않는다.
 */
export function createTask(text, categoryOrOpts, date, scope) {
  const o =
    categoryOrOpts && typeof categoryOrOpts === "object"
      ? categoryOrOpts
      : { category: categoryOrOpts, date, scope };

  const task = {
    id: newId(),
    text: String(text).trim(),
    category: CATEGORIES.includes(o.category) ? o.category : CATEGORIES[0],
    completed: false,
    createdAt: Date.now(),
    date: isISODate(o.date) ? o.date : todayISODate(),
  };
  if (o.scope === "week" || o.scope === "month") task.scope = o.scope;
  if (typeof o.subcategory === "string" && o.subcategory.trim()) {
    task.subcategory = o.subcategory.trim();
  }
  if (o.priority === "high" || o.priority === "low") task.priority = o.priority;
  if (isISODate(o.endDate) && o.endDate > task.date) task.endDate = o.endDate;
  if (typeof o.notes === "string" && o.notes.trim()) task.notes = o.notes;
  if (o.recurrence && RECUR_FREQS.includes(o.recurrence.freq)) {
    task.recurrence = normRecurrence(o.recurrence, task.date);
  }
  if (typeof o.series === "string" && o.series) task.series = o.series;
  return task;
}

/** recurrence 규칙 정규화. weekly는 days 를 항상 채운다(top-up 안정성). */
function normRecurrence(r, baseISO) {
  const out = { freq: r.freq };
  if (r.freq === "weekly") {
    const days = Array.isArray(r.days)
      ? [...new Set(r.days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : [];
    out.days = (days.length ? days : [parseISO(baseISO).getDay()]).sort(
      (a, b) => a - b
    );
  }
  if (isISODate(r.until)) out.until = r.until;
  return out;
}

/**
 * 할 일을 목록 맨 앞에 추가한다. 빈 텍스트면 원본을 그대로 반환한다.
 *   addTask(tasks, text, "업무", "2026-09-08", "week")   // 위치 인자
 *   addTask(tasks, text, { category, date, ... })        // 옵션 객체
 * @returns {Array} 새 배열
 */
export function addTask(tasks, text, categoryOrOpts, date, scope) {
  if (!String(text).trim()) return tasks;
  return [createTask(text, categoryOrOpts, date, scope), ...tasks];
}

/** 완료 여부를 토글한 새 배열을 반환한다. 완료 시 doneAt 기록, 해제 시 제거. */
export function toggleTask(tasks, id) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const done = !t.completed;
    const next = { ...t, completed: done };
    if (done) {
      next.doneAt = Date.now();
      delete next.status;
    } else {
      delete next.doneAt;
    }
    return next;
  });
}

/** 진행 상태를 설정한다("todo" | "doing" | "done"). completed·doneAt·status를 일관되게 유지. */
export function setTaskStatus(tasks, id, status) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (status === "done") {
      next.completed = true;
      next.doneAt =
        t.completed && typeof t.doneAt === "number" ? t.doneAt : Date.now();
      delete next.status;
    } else if (status === "doing") {
      next.completed = false;
      next.status = "doing";
      delete next.doneAt;
    } else {
      next.completed = false;
      delete next.status;
      delete next.doneAt;
    }
    return next;
  });
}

/** 우선순위를 설정한다("high" | "normal" | "low"). normal이면 필드 제거. */
export function setTaskPriority(tasks, id, priority) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (priority === "high" || priority === "low") next.priority = priority;
    else delete next.priority;
    return next;
  });
}

/** 세부분류를 설정한다. valid 목록이 주어지면 그 안에 없으면 제거. */
export function setTaskSubcategory(tasks, id, subcategory, validList) {
  const s = String(subcategory ?? "").trim();
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    const ok =
      s && (!Array.isArray(validList) || validList.includes(s));
    if (ok) next.subcategory = s;
    else delete next.subcategory;
    return next;
  });
}

/** 상세메모를 설정한다. 공백뿐이면 필드 제거. */
export function setTaskNotes(tasks, id, notes) {
  const val = String(notes ?? "");
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (val.trim()) next.notes = val;
    else delete next.notes;
    return next;
  });
}

/**
 * 할 일의 날짜/기간 단위를 바꾼다(F5). 주어진 키만 반영한다.
 * @param {{date?: string, endDate?: string|null, scope?: "day"|"week"|"month"}} patch
 */
export function rescheduleTask(tasks, id, patch = {}) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (isISODate(patch.date)) next.date = patch.date;
    if (patch.scope === "week" || patch.scope === "month") next.scope = patch.scope;
    else if (patch.scope === "day") delete next.scope;
    if (patch.endDate !== undefined) {
      if (isISODate(patch.endDate) && patch.endDate > next.date) {
        next.endDate = patch.endDate;
      } else {
        delete next.endDate;
      }
    }
    // 날짜를 당겨 endDate가 무의미해졌으면 정리
    if (next.endDate && next.endDate <= next.date) delete next.endDate;
    return next;
  });
}

/** 항목을 제거한 새 배열을 반환한다. */
export function deleteTask(tasks, id) {
  return tasks.filter((t) => t.id !== id);
}

/**
 * 텍스트·카테고리를 수정한 새 배열을 반환한다.
 * trim 결과가 비면 변경 없이 원본을 반환한다(호출부가 편집 모드 유지).
 */
export function editTask(tasks, id, text, category) {
  const trimmed = String(text).trim();
  if (!trimmed) return tasks;
  return tasks.map((t) =>
    t.id === id
      ? {
          ...t,
          text: trimmed,
          category: CATEGORIES.includes(category) ? category : t.category,
        }
      : t
  );
}

/**
 * fromId 항목을 toId 항목의 앞/뒤로 이동한 새 배열을 반환한다.
 * 둘 중 하나라도 못 찾거나 같으면 원본을 반환한다.
 * @param {"before"|"after"} place
 */
export function reorderTask(tasks, fromId, toId, place = "before") {
  if (fromId === toId) return tasks;
  const fromIdx = tasks.findIndex((t) => t.id === fromId);
  const toIdx = tasks.findIndex((t) => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return tasks;

  const next = tasks.slice();
  const [moved] = next.splice(fromIdx, 1);
  // splice 후 toId의 새 위치를 다시 찾는다.
  const anchor = next.findIndex((t) => t.id === toId);
  const insertAt = place === "after" ? anchor + 1 : anchor;
  next.splice(insertAt, 0, moved);
  return next;
}

/** 항목을 한 칸 위/아래로 이동한 새 배열. (키보드 재정렬용) */
export function moveTask(tasks, id, delta) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return tasks;
  const target = idx + delta;
  if (target < 0 || target >= tasks.length) return tasks;
  const next = tasks.slice();
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

/**
 * 정렬 모드에 따라 정렬된 새 배열을 반환한다.
 * JS의 Array.prototype.sort는 안정 정렬이므로 동순위는 원래 순서를 유지한다.
 */
export function sortTasks(tasks, mode) {
  const arr = tasks.slice();
  const byCreatedDesc = (a, b) => b.createdAt - a.createdAt;
  switch (mode) {
    case "priority":
      return arr.sort(
        (a, b) =>
          PRIO_RANK[taskPriority(a)] - PRIO_RANK[taskPriority(b)] ||
          byCreatedDesc(a, b)
      );
    case "date-asc":
      return arr.sort(
        (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt
      );
    case "created-desc":
      return arr.sort(byCreatedDesc);
    case "created-asc":
      return arr.sort((a, b) => a.createdAt - b.createdAt);
    case "category":
      return arr.sort(
        (a, b) =>
          CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
          byCreatedDesc(a, b)
      );
    case "active-first": {
      // 작업중 → 대기 → 완료
      const rank = { doing: 0, todo: 1, done: 2 };
      return arr.sort(
        (a, b) => rank[taskStatus(a)] - rank[taskStatus(b)] || byCreatedDesc(a, b)
      );
    }
    case "manual":
    default:
      return arr;
  }
}

/* ── 기간(일/주) 스코프 ───────────────────────────────────────
 * 정렬·필터보다 먼저 적용한다: 기간 스코프 → sortTasks → visibleTasks.
 */

/** 할 일의 끝나는 날(포함). 여러 날 항목이면 endDate, 아니면 date. */
export const taskEndDate = (t) =>
  isISODate(t?.endDate) && t.endDate > t.date ? t.endDate : t.date;

/** 해당 날짜(iso)에 걸치는 할 일만("day" 스코프, 여러 날 span 포함). */
export function tasksOnDay(tasks, iso) {
  return tasks.filter(
    (t) => taskScope(t) === "day" && t.date <= iso && taskEndDate(t) >= iso
  );
}

/** anchorIso가 속한 주(일~토)에 걸치는 할 일 + 그 주 계획. (월 계획은 제외) */
export function tasksInWeek(tasks, anchorIso) {
  const lo = startOfWeek(anchorIso);
  const hi = endOfWeek(anchorIso);
  return tasks.filter(
    (t) =>
      taskScope(t) !== "month" && t.date <= hi && taskEndDate(t) >= lo
  );
}

/** anchorIso가 속한 달의 모든 할 일 (일·주·월 계획 전부). 시작일 앞 7자 비교. */
export function tasksInMonth(tasks, anchorIso) {
  const ym = String(anchorIso).slice(0, 7);
  return tasks.filter((t) => t.date.slice(0, 7) === ym);
}

/**
 * 날짜별 집계. 달력 마커용 — 특정 날에 걸치는 "day" 할 일만 센다(여러 날은 각 날에).
 * @returns {Record<string, {total: number, done: number}>}
 */
export function countByDate(tasks) {
  const out = {};
  for (const t of tasks) {
    if (taskScope(t) !== "day") continue;
    const end = taskEndDate(t);
    for (let d = t.date; d <= end; d = addDays(d, 1)) {
      const bucket = (out[d] ??= { total: 0, done: 0 });
      bucket.total += 1;
      if (t.completed) bucket.done += 1;
    }
  }
  return out;
}

/**
 * 필터 칩용 집계: 전체 + 카테고리별 개수. 필터·완료 숨김과 무관한
 * "등록된 갯수"이며, 호출 전에 기간(일/주/월) 스코프만 적용한다.
 * @returns {Record<string, number>}  { 전체, 개인, 업무, 공부 }
 */
export function countByFilter(tasks) {
  const out = { 전체: tasks.length };
  for (const c of CATEGORIES) out[c] = 0;
  for (const t of tasks) {
    if (out[t.category] !== undefined) out[t.category] += 1;
  }
  return out;
}

/** 세부분류 트리용 집계. { 전체, [cat]: { 전체, 미분류, [sub]: n } } 업무는 "부모/자식" 키로 집계. */
export function countBySubcat(tasks) {
  const out = { 전체: tasks.length };
  for (const c of CATEGORIES) out[c] = { 전체: 0, 미분류: 0 };
  for (const t of tasks) {
    const bucket = out[t.category];
    if (!bucket) continue;
    bucket.전체 += 1;
    const s =
      typeof t.subcategory === "string" && t.subcategory ? t.subcategory : null;
    if (s) {
      bucket[s] = (bucket[s] ?? 0) + 1;
      if (t.category === "업무") {
        const i = s.indexOf("/");
        if (i !== -1) {
          const parent = s.slice(0, i);
          bucket[parent] = (bucket[parent] ?? 0) + 1;
        }
      }
    } else {
      bucket.미분류 += 1;
    }
  }
  return out;
}

/**
 * filter 문자열을 { cat, subpath } 로 파싱. 업무는 "부모/자식" 계층 지원.
 *   "전체"                      → { cat: null, subpath: null }
 *   "업무"                      → { cat: "업무", subpath: null }
 *   "업무/빅데이터"             → { cat: "업무", subpath: "빅데이터" }
 *   "업무/빅데이터/로케이션찾기" → { cat: "업무", subpath: "빅데이터/로케이션찾기" }
 *   "업무/"                     → { cat: "업무", subpath: "" }   (미분류)
 */
export function parseFilter(filter) {
  if (!filter || filter === "전체") return { cat: null, subpath: null };
  const i = String(filter).indexOf("/");
  if (i === -1) return { cat: filter, subpath: null };
  return { cat: filter.slice(0, i), subpath: filter.slice(i + 1) };
}

/**
 * 필터(카테고리/세부분류) + 완료 숨김을 적용한 목록을 반환한다(정렬 이후 호출).
 * @param {{filter?: string, hideCompleted?: boolean, subcats?: object}} opts
 *   업무의 부모 필터(예: "업무/빅데이터")는 그 부모의 모든 자식 세부분류를 포함.
 */
export function visibleTasks(
  tasks,
  { filter = "전체", hideCompleted = false, subcats = {} }
) {
  const { cat, subpath } = parseFilter(filter);

  // 부모 필터(업무/빅데이터) vs 자식 필터(업무/빅데이터/로케이션찾기) 구분
  let targetSubcategory = null;  // 자식 필터인 경우 정확한 자식명
  let validSubcats = null;       // 부모 필터인 경우 자식들 set

  if (cat === "업무" && subpath && subpath !== "" && subcats?.업무) {
    const businessMap = subcats.업무;
    const slashIndex = subpath.indexOf("/");

    if (slashIndex !== -1) {
      // 자식 필터: "빅데이터/로케이션찾기" → 부모="빅데이터", 자식="로케이션찾기"
      const parent = subpath.slice(0, slashIndex);
      const child = subpath.slice(slashIndex + 1);
      const parentChildren = businessMap[parent];
      if (Array.isArray(parentChildren) && parentChildren.includes(child)) {
        // 할일의 subcategory가 "부모/자식" 또는 "자식"만의 형태일 수 있으므로 양쪽 모두 허용
        targetSubcategory = child;
        // 실제로는 "부모/자식" 형태로도 비교하도록 Set으로 구성
        validSubcats = new Set([child, subpath]);
      }
    } else {
      // 부모 필터: "빅데이터"
      const parentChildren = businessMap[subpath];
      if (Array.isArray(parentChildren) && parentChildren.length > 0) {
        // 할일의 subcategory가 "부모/자식" 형태일 수 있으므로 양쪽 형태 모두 허용
        validSubcats = new Set([
          ...parentChildren, // 자식만 ("로케이션찾기")
          ...parentChildren.map(child => `${subpath}/${child}`), // 부모/자식 ("빅데이터/로케이션찾기")
        ]);
      }
    }
  }


  const filtered = tasks.filter((t) => {
    if (cat && t.category !== cat) return false;
    if (subpath !== null) {
      const tsub =
        typeof t.subcategory === "string" && t.subcategory ? t.subcategory : "";
      if (subpath === "") {
        // 미분류: subcategory가 없어야 함
        if (tsub !== "") return false;
      } else if (validSubcats) {
        // 부모 필터: 그 부모의 모든 자식 포함
        if (!validSubcats.has(tsub)) return false;
      } else {
        // 일반 세부분류 필터 (업무가 아닌 경우): 정확히 일치
        if (tsub !== subpath) return false;
      }
    }
    if (hideCompleted && t.completed) return false;
    return true;
  });

  return filtered;
}

/**
 * 진행률. 항상 전체 tasks 기준(필터 무관).
 * @returns {{total:number, done:number, percent:number}}
 */
export function progress(tasks) {
  const total = tasks.length;
  const done = tasks.reduce((n, t) => n + (t.completed ? 1 : 0), 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

/* ── 반복(F3) ─────────────────────────────────────────────────
 * 반복 항목은 "가상"이 아니라 실제 인스턴스를 만들어 둔다(기존 날짜별 모델과
 * 그대로 맞물린다). 각 인스턴스는 독립적인 Task이고 같은 `series` id를 공유한다.
 * 생성 시 horizon(기본 8주) 까지 만들고, 앱 로드 때 topUpSeries 로 연장한다.
 */

const RECUR_LABELS = { daily: "매일", weekdays: "평일", weekly: "매주" };

/** 반복 규칙 요약 문구. */
export function recurrenceLabel(rec) {
  if (!rec || !RECUR_FREQS.includes(rec.freq)) return "";
  if (rec.freq !== "weekly") return RECUR_LABELS[rec.freq];
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const days = Array.isArray(rec.days) && rec.days.length ? rec.days : [];
  return days.length ? `매주 ${days.map((d) => names[d]).join("·")}` : "매주";
}

/** startISO 부터 horizonISO(포함)까지 규칙에 맞는 날짜 배열. */
export function expandRecurrence(startISO, recurrence, horizonISO) {
  if (!recurrence || !RECUR_FREQS.includes(recurrence.freq)) return [startISO];
  const cap =
    isISODate(recurrence.until) && recurrence.until < horizonISO
      ? recurrence.until
      : horizonISO;
  const days = Array.isArray(recurrence.days) ? recurrence.days : [];
  const startDow = parseISO(startISO).getDay();
  const out = [];
  for (let d = startISO; d <= cap; d = addDays(d, 1)) {
    const dow = parseISO(d).getDay();
    if (recurrence.freq === "daily") out.push(d);
    else if (recurrence.freq === "weekdays") {
      if (dow >= 1 && dow <= 5) out.push(d);
    } else if (days.length ? days.includes(dow) : dow === startDow) {
      out.push(d);
    }
  }
  return out.length ? out : [startISO];
}

/**
 * base(필드 원본) + recurrence 로 인스턴스 배열을 만든다.
 * 각 인스턴스는 새 id + 같은 series + recurrence 규칙 사본을 갖는다.
 */
export function buildSeries(base, recurrence, horizonISO, seriesId = newId()) {
  const startISO = isISODate(base.date) ? base.date : todayISODate();
  const rule = normRecurrence(recurrence, startISO);
  return expandRecurrence(startISO, rule, horizonISO).map((date) => ({
    ...createTask(base.text, {
      category: base.category,
      date,
      subcategory: base.subcategory,
      priority: base.priority,
      notes: base.notes,
    }),
    series: seriesId,
    recurrence: { ...rule, ...(rule.days ? { days: [...rule.days] } : {}) },
  }));
}

/**
 * 열린 반복 시리즈를 오늘 + horizonDays(기본 56일) 앞까지 연장한다.
 * 변화가 없으면 원본 배열을 그대로 반환한다.
 */
export function topUpSeries(tasks, todayISO, horizonDays = 56) {
  const horizonISO = addDays(todayISO, horizonDays);
  const bySeries = new Map();
  for (const t of tasks) {
    if (typeof t.series !== "string" || !t.recurrence) continue;
    if (!bySeries.has(t.series)) bySeries.set(t.series, []);
    bySeries.get(t.series).push(t);
  }
  const added = [];
  for (const [sid, group] of bySeries) {
    const rule = group[0].recurrence;
    if (isISODate(rule.until) && rule.until <= todayISO) continue;
    const template = group.reduce((a, b) => (b.date > a.date ? b : a));
    if (template.date >= horizonISO) continue;
    const from = addDays(template.date, 1);
    for (const date of expandRecurrence(from, rule, horizonISO)) {
      if (date < from) continue;
      added.push({
        ...createTask(template.text, {
          category: template.category,
          date,
          subcategory: template.subcategory,
          priority: template.priority,
        }),
        series: sid,
        recurrence: { ...rule, ...(rule.days ? { days: [...rule.days] } : {}) },
      });
    }
  }
  return added.length ? [...tasks, ...added] : tasks;
}

/** 시리즈 형제. from(ISO) 이후만 원하면 지정. */
export function seriesSiblings(tasks, seriesId, { from } = {}) {
  return tasks.filter(
    (t) => t.series === seriesId && (!from || t.date >= from)
  );
}

/** 시리즈 항목 삭제. fromISO 지정 시 그 날짜 이후만, 없으면 시리즈 전체. */
export function deleteSeriesFrom(tasks, seriesId, fromISO) {
  return tasks.filter(
    (t) => !(t.series === seriesId && (!fromISO || t.date >= fromISO))
  );
}

/* ── 히스토리(F8) ─────────────────────────────────────────────── */

/**
 * 완료된 항목을 검색·필터해 최근 완료 순으로 돌려준다.
 * `doneAt`이 없으면 `createdAt`을 완료 시각으로 본다.
 * @param {{query?: string, from?: string|null, to?: string|null}} opts  from/to는 "YYYY-MM-DD"
 * @returns {Array} 각 항목에 완료시각(ms) `doneAt` 보정됨
 */
export function historyEntries(tasks, { query = "", from = null, to = null } = {}) {
  const q = String(query).trim().toLowerCase();
  return tasks
    .filter((t) => t.completed)
    .map((t) => ({
      ...t,
      doneAt: typeof t.doneAt === "number" ? t.doneAt : t.createdAt,
    }))
    .filter((t) => {
      if (q && !t.text.toLowerCase().includes(q)) return false;
      const day = isoDateFromMillis(t.doneAt);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    })
    .sort((a, b) => b.doneAt - a.doneAt);
}

/* ── 시간별 뷰 ────────────────────────────────────────────────── */

/** 시간 범위: 08:00 ~ 20:00, 1시간 슬롯. @returns {Array<string>} ["08:00", "09:00", ...] */
export function getTimeSlots() {
  const slots = [];
  for (let h = 8; h < 21; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

/** 특정 날짜의 할일을 시간별·미배정으로 분류. */
export function tasksForTimeView(tasks, anchorDate) {
  const scoped = tasks.filter((t) => t.date === anchorDate && taskScope(t) === "day");
  const withTime = scoped.filter((t) => typeof t.startTime === "string");
  const unscheduled = scoped.filter((t) => !t.startTime);
  return { withTime, unscheduled };
}

/** 특정 시간 슬롯(HH:MM)에 해당하는 할일 목록. */
export function tasksInTimeSlot(tasks, slotTime) {
  return tasks.filter((t) => t.startTime === slotTime);
}

/** startTime을 HH:MM으로 정규화. */
export function normalizeStartTime(v) {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!/^\d{1,2}:\d{1,2}$/.test(trimmed)) return undefined;
  const [h, m] = trimmed.split(":");
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 할일의 startTime 설정. */
export function setTaskStartTime(task, startTime) {
  const normalized = normalizeStartTime(startTime);
  if (normalized === undefined) return task;
  return { ...task, startTime: normalized };
}
