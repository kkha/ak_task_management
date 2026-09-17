"use strict";

import { CATEGORIES, SORT_MODES, SCOPES, RECUR_FREQS } from "./tasks.js";
import { normalizeClassifierConfig, emptyKeywordMap } from "./classify.js";
import { DEFAULT_SUBCATS, normalizeSubcats } from "./subcats.js";
import { isISODate, isoDateFromMillis } from "./dates.js";
import { VERSION } from "./version.js";

export const VIEWS = ["day", "week", "month", "time"];

/* ──────────────────────────────────────────────────────────────
 * 데이터 레이어. localStorage 입출력과 경계 입력 검증.
 * localStorage는 시크릿 모드 등에서 막힐 수 있고 값이 손상됐을 수도 있다.
 * 어느 쪽이든 앱은 죽지 않고 안전한 기본값으로 시작한다.
 * ────────────────────────────────────────────────────────────── */

export const TASKS_KEY = "task-app.tasks";
export const PREFS_KEY = "task-app.prefs";
export const CLASSIFIER_KEY = "task-app.classifier";
export const MEMO_KEY = "task-app.memo";
export const SUBCATS_KEY = "task-app.subcategories";

export const DEFAULT_PREFS = Object.freeze({
  filter: "전체",
  sort: "manual",
  hideCompleted: false,
  theme: "system", // "system" | "light" | "dark"
  view: "day", // "day" | "week" | "month" | "time"
});

/**
 * 임의의 값이 유효한 Task인지 검사한다. (스키마 경계 검증)
 * @returns {boolean}
 */
export function isValidTask(v) {
  return (
    !!v &&
    typeof v === "object" &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.text === "string" &&
    CATEGORIES.includes(v.category) &&
    typeof v.completed === "boolean" &&
    typeof v.createdAt === "number" &&
    Number.isFinite(v.createdAt) &&
    isISODate(v.date) &&
    (v.scope === undefined || SCOPES.includes(v.scope)) &&
    (v.status === undefined || v.status === "doing") &&
    (v.priority === undefined || v.priority === "high" || v.priority === "low") &&
    (v.subcategory === undefined || typeof v.subcategory === "string") &&
    (v.endDate === undefined || isISODate(v.endDate)) &&
    (v.notes === undefined || typeof v.notes === "string") &&
    (v.doneAt === undefined ||
      (typeof v.doneAt === "number" && Number.isFinite(v.doneAt))) &&
    (v.series === undefined || typeof v.series === "string") &&
    (v.recurrence === undefined ||
      (!!v.recurrence &&
        typeof v.recurrence === "object" &&
        RECUR_FREQS.includes(v.recurrence.freq))) &&
    (v.startTime === undefined || isValidTimeHM(v.startTime))
  );
}

/** HH:MM 형식의 유효한 시간인지 검사한다. */
export function isValidTimeHM(v) {
  if (typeof v !== "string" || v.length !== 5) return false;
  const [h, m] = v.split(":");
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  return !isNaN(hh) && !isNaN(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/** recurrence 규칙 정규화(경계 검증용). 유효하지 않으면 null. */
function normRecurrence(r) {
  if (!r || typeof r !== "object" || !RECUR_FREQS.includes(r.freq)) return null;
  const out = { freq: r.freq };
  if (r.freq === "weekly") {
    const days = Array.isArray(r.days)
      ? [
          ...new Set(
            r.days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
          ),
        ].sort((a, b) => a - b)
      : [];
    if (days.length) out.days = days;
  }
  if (isISODate(r.until)) out.until = r.until;
  return out;
}

const OPTIONAL_TASK_KEYS = [
  "scope",
  "status",
  "priority",
  "subcategory",
  "endDate",
  "notes",
  "doneAt",
  "series",
  "recurrence",
  "startTime",
];

/**
 * 손상 가능성이 있는 Task 배열을 정제한다: 유효 항목만 + id 중복 제거.
 * `date`가 없는 구 스키마 데이터는 `createdAt`의 날짜로 마이그레이션한다.
 * 알 수 없거나 잘못된 선택 필드는 떼어내고 항목 자체는 살린다. 필드 간
 * 모순(status↔completed, endDate≤date, doneAt without completed)도 정리한다.
 */
export function sanitizeTasks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = { ...raw };

    if (!isISODate(item.date)) item.date = isoDateFromMillis(item.createdAt);
    if (!SCOPES.includes(item.scope) || item.scope === "day") delete item.scope;
    if (item.status !== "doing") delete item.status;
    if (item.priority !== "high" && item.priority !== "low") delete item.priority;
    if (typeof item.subcategory !== "string" || !item.subcategory.trim()) {
      delete item.subcategory;
    } else {
      item.subcategory = item.subcategory.trim();
    }
    if (!isISODate(item.endDate) || !(item.endDate > item.date)) {
      delete item.endDate;
    }
    if (typeof item.notes !== "string" || !item.notes.trim()) delete item.notes;
    if (typeof item.series !== "string" || !item.series) delete item.series;
    const rec = normRecurrence(item.recurrence);
    if (rec) item.recurrence = rec;
    else delete item.recurrence;
    // status/completed/doneAt 일관성 — completed 가 정본
    if (item.completed === true) delete item.status;
    if (
      item.completed !== true ||
      typeof item.doneAt !== "number" ||
      !Number.isFinite(item.doneAt)
    ) {
      delete item.doneAt;
    }

    if (!isValidTask(item) || seen.has(item.id)) continue;
    seen.add(item.id);

    const clean = {
      id: item.id,
      text: item.text,
      category: item.category,
      completed: item.completed,
      createdAt: item.createdAt,
      date: item.date,
    };
    for (const k of OPTIONAL_TASK_KEYS) {
      if (item[k] !== undefined) clean[k] = item[k];
    }
    out.push(clean);
  }
  return out;
}

/** localStorage에서 할 일 배열을 읽는다. 실패 시 빈 배열. */
export function loadTasks(store = safeStorage()) {
  try {
    const raw = store.getItem(TASKS_KEY);
    if (!raw) return [];
    return sanitizeTasks(JSON.parse(raw));
  } catch (err) {
    console.warn(
      "할 일 데이터를 불러오지 못했습니다. 빈 목록으로 시작합니다.",
      err
    );
    return [];
  }
}

/** 할 일 배열을 저장한다. 실패(용량 초과·비활성화)는 경고만 남기고 삼킨다. */
export function saveTasks(tasks, store = safeStorage()) {
  try {
    store.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn("할 일 데이터를 저장하지 못했습니다.", err);
  }
}

/** filter 문자열이 "전체" | 카테고리 | "카테고리/세부분류" 형태인지. */
function isValidFilter(s) {
  if (typeof s !== "string") return false;
  if (s === "전체") return true;
  return CATEGORIES.includes(s.split("/")[0]);
}

/** 사용자 환경설정을 읽어 기본값과 병합한다. 알 수 없는 값은 기본값으로 보정. */
export function loadPrefs(store = safeStorage()) {
  try {
    const raw = store.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      filter: isValidFilter(parsed.filter)
        ? parsed.filter
        : DEFAULT_PREFS.filter,
      sort: SORT_MODES.includes(parsed.sort) ? parsed.sort : DEFAULT_PREFS.sort,
      hideCompleted:
        typeof parsed.hideCompleted === "boolean"
          ? parsed.hideCompleted
          : DEFAULT_PREFS.hideCompleted,
      theme: ["system", "light", "dark"].includes(parsed.theme)
        ? parsed.theme
        : DEFAULT_PREFS.theme,
      view: VIEWS.includes(parsed.view) ? parsed.view : DEFAULT_PREFS.view,
    };
  } catch (err) {
    console.warn("환경설정을 불러오지 못했습니다. 기본값을 사용합니다.", err);
    return { ...DEFAULT_PREFS };
  }
}

/** 환경설정을 저장한다. */
export function savePrefs(prefs, store = safeStorage()) {
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn("환경설정을 저장하지 못했습니다.", err);
  }
}

/* ── 분류기 설정 (사용자 추가 + 학습 키워드) ─────────────────────
 * { custom: {개인:[],업무:[],공부:[]}, learned: {개인:[],업무:[],공부:[]} }
 * 내장 키워드는 코드에 있고 여기 저장하지 않는다.
 */

export function loadClassifier(store = safeStorage()) {
  try {
    const raw = store.getItem(CLASSIFIER_KEY);
    if (!raw) return { custom: emptyKeywordMap(), learned: emptyKeywordMap() };
    return normalizeClassifierConfig(JSON.parse(raw));
  } catch (err) {
    console.warn(
      "분류 키워드 설정을 불러오지 못했습니다. 기본값을 사용합니다.",
      err
    );
    return { custom: emptyKeywordMap(), learned: emptyKeywordMap() };
  }
}

export function saveClassifier(config, store = safeStorage()) {
  try {
    store.setItem(
      CLASSIFIER_KEY,
      JSON.stringify(normalizeClassifierConfig(config))
    );
  } catch (err) {
    console.warn("분류 키워드 설정을 저장하지 못했습니다.", err);
  }
}

/* ── 메모 (좌측 패널 자유 기록) ──────────────────────────────── */

/** 메모 문자열을 읽는다. 없거나 실패하면 빈 문자열. */
export function loadMemo(store = safeStorage()) {
  try {
    const raw = store.getItem(MEMO_KEY);
    return typeof raw === "string" ? raw : "";
  } catch (err) {
    console.warn("메모를 불러오지 못했습니다.", err);
    return "";
  }
}

/** 메모 문자열을 저장한다. 실패는 삼킨다. */
export function saveMemo(text, store = safeStorage()) {
  try {
    store.setItem(MEMO_KEY, String(text));
  } catch (err) {
    console.warn("메모를 저장하지 못했습니다.", err);
  }
}

/* ── 세부분류 (카테고리별 사용자 목록) ─────────────────────────── */

/** 세부분류 맵을 읽는다. 없으면 기본 시딩값. */
export function loadSubcats(store = safeStorage()) {
  try {
    const raw = store.getItem(SUBCATS_KEY);
    if (!raw) return normalizeSubcats(DEFAULT_SUBCATS);
    return normalizeSubcats(JSON.parse(raw));
  } catch (err) {
    console.warn("세부분류를 불러오지 못했습니다. 기본값을 사용합니다.", err);
    return normalizeSubcats(DEFAULT_SUBCATS);
  }
}

/** 세부분류 맵을 저장한다. 실패는 삼킨다. */
export function saveSubcats(map, store = safeStorage()) {
  try {
    store.setItem(SUBCATS_KEY, JSON.stringify(normalizeSubcats(map)));
  } catch (err) {
    console.warn("세부분류를 저장하지 못했습니다.", err);
  }
}

/* ── 내보내기 / 가져오기 ─────────────────────────────────────── */

/** 할 일, 메모, 세부분류를 사람이 읽기 좋은 JSON 문자열로 직렬화한다. */
export function serializeExport(tasks, memo = "", subcategories = {}) {
  return JSON.stringify(
    {
      app: "my-task-app",
      version: 5,
      appVersion: VERSION,
      exportedAt: Date.now(),
      tasks,
      memo,
      subcategories,
    },
    null,
    2
  );
}

/**
 * 가져오기 텍스트를 파싱·검증한다.
 * 최상위가 배열이거나 { tasks: [...] } 형태를 모두 받는다.
 * @returns {{ ok: true, tasks: Array, memo: string, subcategories: object } | { ok: false, error: string }}
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 형식이 아닙니다." };
  }
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.tasks)
      ? data.tasks
      : null;
  if (!rawList) {
    return { ok: false, error: "할 일 배열을 찾을 수 없습니다." };
  }
  const tasks = sanitizeTasks(rawList);
  if (tasks.length === 0) {
    return { ok: false, error: "가져올 수 있는 유효한 할 일이 없습니다." };
  }
  const memo = typeof data?.memo === "string" ? data.memo : "";
  const subcategories = data?.subcategories && typeof data.subcategories === "object"
    ? normalizeSubcats(data.subcategories)
    : normalizeSubcats({});
  return { ok: true, tasks, memo, subcategories };
}

/* ── 안전한 스토리지 핸들 ────────────────────────────────────── */

/**
 * localStorage 접근 자체가 예외를 던지는 환경(썸네일 캡처, 사이트 데이터 차단)
 * 을 대비해 no-op 스토리지로 폴백한다.
 */
export function safeStorage() {
  try {
    const probe = "__task_app_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return memoryStorage();
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
