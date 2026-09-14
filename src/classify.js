"use strict";

import { CATEGORIES } from "./tasks.js";

/* ──────────────────────────────────────────────────────────────
 * 할 일 텍스트를 보고 카테고리를 추측한다. 순수 함수.
 * 백엔드/LLM 없이 동작해야 하므로 키워드 규칙 기반이다.
 *
 * 판정:
 *   - 각 카테고리의 키워드가 텍스트에 몇 개 들어있는지 센다(부분 문자열)
 *   - 최고 점수가 0 → null (모르겠음, 자동 변경 안 함)
 *   - 최고 점수가 2등과 같음 → null (애매함)
 *   - 그 외 → 최고 점수 카테고리
 * ────────────────────────────────────────────────────────────── */

/** @type {Record<string, string[]>} 소문자로 비교하므로 영어는 소문자로 적는다. */
export const KEYWORDS = {
  업무: [
    "회의",
    "미팅",
    "보고서",
    "결재",
    "발표자료",
    "프레젠테이션",
    "ppt",
    "거래처",
    "고객사",
    "클라이언트",
    "계약서",
    "견적서",
    "제안서",
    "품의",
    "출장",
    "워크숍",
    "컨퍼런스",
    "회사",
    "사무실",
    "팀장",
    "부장",
    "과장",
    "이사회",
    "업무",
    "프로젝트",
    "스프린트",
    "배포",
    "릴리스",
    "회신",
    "정산",
    "세금계산서",
    "매출",
    "kpi",
    "채용",
    "면접",
    "온보딩",
    "스탠드업",
    "일정 공유",
    "주간보고",
    "meeting",
    "report",
    "deadline",
    "invoice",
    "standup",
    "sprint",
    "deploy",
    "interview",
    "client",
  ],
  공부: [
    "공부",
    "강의",
    "강좌",
    "인강",
    "수업",
    "과제",
    "숙제",
    "시험",
    "중간고사",
    "기말고사",
    "퀴즈",
    "복습",
    "예습",
    "알고리즘",
    "코딩테스트",
    "백준",
    "리트코드",
    "토익",
    "토플",
    "오픽",
    "자격증",
    "논문",
    "리서치",
    "스터디",
    "챕터",
    "단어장",
    "문제집",
    "강의노트",
    "수강",
    "학원",
    "필기",
    "개념정리",
    "인프런",
    "강의 듣기",
    "study",
    "exam",
    "homework",
    "lecture",
    "quiz",
    "assignment",
    "coursera",
    "leetcode",
  ],
  개인: [
    "장보기",
    "마트",
    "편의점",
    "쇼핑",
    "청소",
    "대청소",
    "빨래",
    "세탁",
    "설거지",
    "요리",
    "반찬",
    "운동",
    "헬스장",
    "헬스",
    "러닝",
    "조깅",
    "산책",
    "요가",
    "필라테스",
    "병원",
    "약국",
    "치과",
    "은행",
    "미용실",
    "세차",
    "주유",
    "관리비",
    "공과금",
    "전기요금",
    "가스요금",
    "택배",
    "반품",
    "강아지",
    "고양이",
    "부모님",
    "생신",
    "생일",
    "선물",
    "여행",
    "항공권",
    "숙소",
    "저녁약속",
    "점심약속",
    "친구",
    "가족모임",
    "집들이",
    "분리수거",
    "이발",
    "안경",
    "groceries",
    "laundry",
    "cleaning",
    "workout",
    "gym",
    "doctor",
    "dentist",
    "haircut",
  ],
};

/** 빈 카테고리→키워드 맵. { 개인: [], 업무: [], 공부: [] } */
export function emptyKeywordMap() {
  return Object.fromEntries(CATEGORIES.map((c) => [c, []]));
}

/**
 * 여러 키워드 맵을 합친다(중복 제거, 소문자화).
 * @param {...Record<string,string[]>} sets
 * @returns {Record<string,string[]>}
 */
export function mergeKeywords(...sets) {
  const out = emptyKeywordMap();
  for (const cat of CATEGORIES) {
    const seen = new Set();
    for (const set of sets) {
      for (const kw of set?.[cat] ?? []) {
        const k = String(kw).toLowerCase().trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          out[cat].push(k);
        }
      }
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {Record<string,string[]>} [keywords] - 기본값은 내장 키워드
 * @returns {string|null} CATEGORIES 중 하나 또는 null(확신 없음/애매)
 */
export function classifyCategory(text, keywords = KEYWORDS) {
  const s = String(text).toLowerCase();
  if (!s.trim()) return null;

  const scored = CATEGORIES.map((cat) => ({
    cat,
    score: (keywords[cat] ?? []).reduce(
      (n, kw) => (kw && s.includes(String(kw).toLowerCase()) ? n + 1 : n),
      0
    ),
  })).sort((a, b) => b.score - a.score);

  if (scored[0].score === 0) return null;
  if (scored[0].score === scored[1].score) return null; // 동점 → 애매
  return scored[0].cat;
}

/* ── 학습 (수동 교정 → 키워드) ─────────────────────────────────── */

// 후보에서 떼어낼 조사/어미. 토큰 끝에 붙어 있으면 제거한다.
const TRAILING = [
  "습니다",
  "합니다",
  "하기",
  "하러",
  "해야",
  "하고",
  "한다",
  "해줘",
  "했음",
  "에서",
  "으로",
  "한테",
  "에게",
  "까지",
  "부터",
  "이랑",
  "라고",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "에",
  "와",
  "과",
  "도",
  "만",
  "의",
  "좀",
];

// 학습 대상에서 뺄 흔한 잡음 단어.
const STOPWORDS = new Set([
  "그거",
  "이거",
  "저거",
  "그것",
  "오늘",
  "내일",
  "어제",
  "빨리",
  "다시",
  "관련",
  "준비",
  "정리",
  "확인",
  "체크",
  "완료",
  "시작",
  "관하여",
  "위해",
  "todo",
  "task",
  "the",
  "and",
  "for",
  "with",
]);

/**
 * 텍스트에서 키워드 후보를 뽑는다(가벼운 토크나이저 — 완벽하지 않다).
 * @returns {string[]} 길이순(긴 것 먼저), 최대 6개
 */
export function extractCandidates(text) {
  const raw = String(text)
    .toLowerCase()
    .split(/[\s,./·|:;~!?()[\]{}"'`^\\<>@#$%&*+=–—-]+/);

  const seen = new Set();
  const out = [];
  for (let tok of raw) {
    for (const suf of TRAILING) {
      if (tok.length > suf.length + 1 && tok.endsWith(suf)) {
        tok = tok.slice(0, -suf.length);
        break;
      }
    }
    if (
      tok.length >= 2 &&
      tok.length <= 12 &&
      !/\d/.test(tok) &&
      !STOPWORDS.has(tok) &&
      !seen.has(tok)
    ) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 6);
}

/** config.custom / config.learned 모양을 보정한다. */
export function normalizeClassifierConfig(raw) {
  const pick = (obj) => {
    const map = emptyKeywordMap();
    if (obj && typeof obj === "object") {
      for (const cat of CATEGORIES) {
        if (Array.isArray(obj[cat])) {
          map[cat] = [
            ...new Set(
              obj[cat]
                .filter((k) => typeof k === "string")
                .map((k) => k.toLowerCase().trim())
                .filter((k) => k.length >= 2 && k.length <= 24)
            ),
          ];
        }
      }
    }
    return map;
  };
  return { custom: pick(raw?.custom), learned: pick(raw?.learned) };
}

/** 특정 카테고리에 이미 알려진 키워드인지(내장+사용자 전체). */
function isKnown(config, kw) {
  const all = mergeKeywords(KEYWORDS, config.custom, config.learned);
  return CATEGORIES.some((cat) => all[cat].includes(kw));
}

/**
 * 사용자 추가 키워드를 넣는다. 이미 알려진 키워드면 무시한다.
 * @returns {{config: object, added: string[]}}
 */
export function addKeyword(config, category, keyword) {
  const kw = String(keyword).toLowerCase().trim();
  const next = normalizeClassifierConfig(config);
  if (
    !CATEGORIES.includes(category) ||
    kw.length < 2 ||
    kw.length > 24 ||
    isKnown(next, kw)
  ) {
    return { config: next, added: [] };
  }
  next.custom[category] = [...next.custom[category], kw];
  return { config: next, added: [kw] };
}

/** 사용자 추가·학습 키워드에서 제거한다(내장 키워드는 못 지운다). */
export function removeKeyword(config, category, keyword) {
  const kw = String(keyword).toLowerCase().trim();
  const next = normalizeClassifierConfig(config);
  if (!CATEGORIES.includes(category)) return next;
  next.custom[category] = next.custom[category].filter((k) => k !== kw);
  next.learned[category] = next.learned[category].filter((k) => k !== kw);
  return next;
}

/**
 * 수동 교정으로부터 학습한다: text에서 아직 모르는 후보 1개를 뽑아
 * learned[category]에 추가한다.
 * @returns {{config: object, added: string[]}}
 */
export function learnFromText(config, text, category) {
  const next = normalizeClassifierConfig(config);
  if (!CATEGORIES.includes(category)) return { config: next, added: [] };

  const candidate = extractCandidates(text).find((c) => !isKnown(next, c));
  if (!candidate) return { config: next, added: [] };

  next.learned[category] = [...next.learned[category], candidate];
  return { config: next, added: [candidate] };
}
