"use strict";

import { CATEGORIES } from "./tasks.js";

/* ──────────────────────────────────────────────────────────────
 * 카테고리별 사용자 관리형 세부분류. 순수 함수 — DOM·저장소 의존 없음.
 * 저장 형태: { 개인: string[], 업무: string[], 공부: string[] }
 * 저장키는 storage.js 의 SUBCATS_KEY.
 * ────────────────────────────────────────────────────────────── */

/** 첫 실행 시 시딩값. 업무는 중첩 구조, 나머지는 평탄. */
export const DEFAULT_SUBCATS = Object.freeze({
  개인: [],
  업무: {
    빅데이터: ["로케이션찾기", "이슈분석"],
    "AI/자동화": [],
    UT일반: [],
    UT과제: [],
  },
  공부: [],
});

const MAX_LEN = 24;
const MAX_PER_CAT = 40;

/** 손상 가능성 있는 값을 정규화한다: 카테고리 3종 고정, trim·중복 제거·길이 캡. 업무는 중첩 구조. */
export function normalizeSubcats(value) {
  const out = {};
  for (const cat of CATEGORIES) {
    if (cat === "업무") {
      const raw = value?.[cat] ?? {};
      const normalizedMap = {};
      if (typeof raw === "object" && !Array.isArray(raw)) {
        for (const [parent, children] of Object.entries(raw)) {
          const p = String(parent ?? "").trim().slice(0, MAX_LEN);
          if (!p) continue;
          const childArray = Array.isArray(children) ? children : [];
          const seen = new Set();
          normalizedMap[p] = [];
          for (const child of childArray) {
            const c = String(child ?? "").trim().slice(0, MAX_LEN);
            if (!c || seen.has(c) || normalizedMap[p].length >= MAX_PER_CAT)
              continue;
            seen.add(c);
            normalizedMap[p].push(c);
          }
        }
      }
      out[cat] = normalizedMap;
    } else {
      const raw = Array.isArray(value?.[cat]) ? value[cat] : [];
      const seen = new Set();
      out[cat] = [];
      for (const item of raw) {
        const s = String(item ?? "")
          .trim()
          .slice(0, MAX_LEN);
        if (!s || seen.has(s) || out[cat].length >= MAX_PER_CAT) continue;
        seen.add(s);
        out[cat].push(s);
      }
    }
  }
  return out;
}

/** 특정 카테고리의 세부분류 배열(없으면 []). 업무는 부모 목록, 다른 카테고리는 평탄 배열. */
export function subcatsOf(map, cat) {
  if (cat === "업무") {
    const raw = map?.[cat] ?? {};
    return typeof raw === "object" && !Array.isArray(raw)
      ? Object.keys(raw)
      : [];
  }
  return Array.isArray(map?.[cat]) ? map[cat] : [];
}

/** 업무의 특정 부모 아래 자식 목록. 없으면 []. */
export function childrenOf(map, parent) {
  const raw = map?.업무 ?? {};
  return Array.isArray(raw[parent]) ? raw[parent] : [];
}

/** 세부분류 추가. 업무의 경우 parentName이 있으면 자식 추가, 없으면 부모 추가. @returns {{map, added: boolean}} */
export function addSubcat(map, cat, name, parentName) {
  const s = String(name ?? "")
    .trim()
    .slice(0, MAX_LEN);
  if (!s || !CATEGORIES.includes(cat)) {
    return { map, added: false };
  }

  if (cat === "업무") {
    const normalized = normalizeSubcats(map);
    if (parentName) {
      const childList = childrenOf(normalized, parentName);
      if (childList.includes(s)) return { map, added: false };
      const newMap = {
        ...normalized,
        업무: {
          ...normalized.업무,
          [parentName]: [...childList, s],
        },
      };
      return { map: newMap, added: true };
    } else {
      const parents = subcatsOf(normalized, "업무");
      if (parents.includes(s)) return { map, added: false };
      const newMap = {
        ...normalized,
        업무: { ...normalized.업무, [s]: [] },
      };
      return { map: newMap, added: true };
    }
  } else {
    const cur = subcatsOf(map, cat);
    if (cur.includes(s)) {
      return { map, added: false };
    }
    return { map: { ...normalizeSubcats(map), [cat]: [...cur, s] }, added: true };
  }
}

/** 세부분류 삭제. 업무의 경우 parentName이 있으면 자식 삭제, 없으면 부모 삭제. */
export function removeSubcat(map, cat, name, parentName) {
  if (cat === "업무") {
    const normalized = normalizeSubcats(map);
    if (parentName) {
      const childList = childrenOf(normalized, parentName);
      if (!childList.includes(name)) return map;
      const newMap = {
        ...normalized,
        업무: {
          ...normalized.업무,
          [parentName]: childList.filter((x) => x !== name),
        },
      };
      return newMap;
    } else {
      const parents = subcatsOf(normalized, "업무");
      if (!parents.includes(name)) return map;
      const newMap = { ...normalized, 업무: { ...normalized.업무 } };
      delete newMap.업무[name];
      return newMap;
    }
  } else {
    const cur = subcatsOf(map, cat);
    if (!cur.includes(name)) return map;
    return { ...normalizeSubcats(map), [cat]: cur.filter((x) => x !== name) };
  }
}

/** 세부분류 이름 변경. 업무의 경우 parentName이 있으면 자식 변경, 없으면 부모 변경. @returns {{map, renamed: boolean}} */
export function renameSubcat(map, cat, from, to, parentName) {
  const s = String(to ?? "")
    .trim()
    .slice(0, MAX_LEN);
  if (!s) return { map, renamed: false };

  if (cat === "업무") {
    const normalized = normalizeSubcats(map);
    if (parentName) {
      const childList = childrenOf(normalized, parentName);
      const i = childList.indexOf(from);
      if (i === -1 || (s !== from && childList.includes(s))) {
        return { map, renamed: false };
      }
      const next = childList.slice();
      next[i] = s;
      const newMap = {
        ...normalized,
        업무: { ...normalized.업무, [parentName]: next },
      };
      return { map: newMap, renamed: true };
    } else {
      const parents = subcatsOf(normalized, "업무");
      const i = parents.indexOf(from);
      if (i === -1 || (s !== from && parents.includes(s))) {
        return { map, renamed: false };
      }
      const newMap = { ...normalized, 업무: {} };
      for (const [k, v] of Object.entries(normalized.업무)) {
        newMap.업무[k === from ? s : k] = v;
      }
      return { map: newMap, renamed: true };
    }
  } else {
    const cur = subcatsOf(map, cat);
    const i = cur.indexOf(from);
    if (i === -1 || (s !== from && cur.includes(s))) {
      return { map, renamed: false };
    }
    const next = cur.slice();
    next[i] = s;
    return { map: { ...normalizeSubcats(map), [cat]: next }, renamed: true };
  }
}
