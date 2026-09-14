import { describe, it, expect } from "vitest";
import {
  classifyCategory,
  KEYWORDS,
  mergeKeywords,
  emptyKeywordMap,
  extractCandidates,
  normalizeClassifierConfig,
  addKeyword,
  removeKeyword,
  learnFromText,
} from "../src/classify.js";
import { CATEGORIES } from "../src/tasks.js";

const emptyConfig = () => ({
  custom: emptyKeywordMap(),
  learned: emptyKeywordMap(),
});

describe("classifyCategory", () => {
  it("업무 키워드가 있으면 업무", () => {
    expect(classifyCategory("팀 회의 자료 준비")).toBe("업무");
    expect(classifyCategory("거래처에 견적서 보내기")).toBe("업무");
    expect(classifyCategory("prep standup notes")).toBe("업무");
  });

  it("공부 키워드가 있으면 공부", () => {
    expect(classifyCategory("알고리즘 3문제 풀기")).toBe("공부");
    expect(classifyCategory("토익 단어장 복습")).toBe("공부");
    expect(classifyCategory("finish leetcode assignment")).toBe("공부");
  });

  it("개인 키워드가 있으면 개인", () => {
    expect(classifyCategory("마트에서 장보기")).toBe("개인");
    expect(classifyCategory("강아지 산책 시키기")).toBe("개인");
    expect(classifyCategory("치과 예약하기")).toBe("개인");
  });

  it("키워드가 없으면 null", () => {
    expect(classifyCategory("그거 하기")).toBeNull();
    expect(classifyCategory("음")).toBeNull();
  });

  it("빈 문자열/공백이면 null", () => {
    expect(classifyCategory("")).toBeNull();
    expect(classifyCategory("   ")).toBeNull();
  });

  it("여러 카테고리가 같은 점수면 애매 → null", () => {
    // "회의"(업무 1) + "복습"(공부 1) → 1:1 동점
    expect(classifyCategory("회의 내용 복습")).toBeNull();
  });

  it("더 많이 매칭된 카테고리가 이긴다", () => {
    // 업무 2(회의, 보고서) vs 공부 1(복습)
    expect(classifyCategory("회의 보고서 초안 만들고 복습")).toBe("업무");
  });

  it("대소문자를 가리지 않는다", () => {
    expect(classifyCategory("MEETING with CLIENT")).toBe("업무");
  });

  it("결과는 항상 유효 카테고리이거나 null", () => {
    for (const sample of [
      "회의",
      "산책",
      "시험공부",
      "랜덤한 문장 12345",
      "",
    ]) {
      const r = classifyCategory(sample);
      expect(r === null || CATEGORIES.includes(r)).toBe(true);
    }
  });

  it("모든 카테고리에 키워드 목록이 있다", () => {
    for (const cat of CATEGORIES) {
      expect(Array.isArray(KEYWORDS[cat])).toBe(true);
      expect(KEYWORDS[cat].length).toBeGreaterThan(5);
    }
  });

  it("사용자 키워드 맵을 넘기면 그걸로 분류한다", () => {
    const kw = emptyKeywordMap();
    kw["개인"] = ["회식"];
    // '회식'은 내장 키워드엔 없다 → 기본은 null, 사용자 맵으로는 개인
    expect(classifyCategory("팀 회식 장소 정하기")).toBeNull();
    expect(classifyCategory("팀 회식 장소 정하기", kw)).toBe("개인");
  });
});

describe("mergeKeywords", () => {
  it("여러 맵을 카테고리별로 합치고 중복을 없앤다", () => {
    const a = { 개인: ["산책"], 업무: ["회의"], 공부: [] };
    const b = { 개인: ["산책", "요가"], 업무: [], 공부: ["시험"] };
    const m = mergeKeywords(a, b);
    expect(m["개인"]).toEqual(["산책", "요가"]);
    expect(m["업무"]).toEqual(["회의"]);
    expect(m["공부"]).toEqual(["시험"]);
  });

  it("소문자로 정규화한다", () => {
    expect(mergeKeywords({ 업무: ["MEETING"] })["업무"]).toEqual(["meeting"]);
  });
});

describe("extractCandidates", () => {
  it("공백/문장부호로 나누고 짧은 토큰·숫자·불용어를 버린다", () => {
    const c = extractCandidates("내일 회식 장소 3곳 예약하기");
    expect(c).toContain("회식");
    expect(c).toContain("장소");
    expect(c).not.toContain("내일"); // 불용어
    expect(c).not.toContain("3곳"); // 숫자 포함 짧은 토큰은 분해됨
  });

  it("흔한 조사·어미를 떼어낸다", () => {
    const c = extractCandidates("워크샵을 준비하기");
    expect(c).toContain("워크샵");
  });

  it("길이순으로 정렬한다", () => {
    const c = extractCandidates("팀 프로젝트 회식");
    expect(c[0].length).toBeGreaterThanOrEqual(c[c.length - 1].length);
  });
});

describe("normalizeClassifierConfig", () => {
  it("빠진 구조를 채우고 잘못된 항목을 버린다", () => {
    const n = normalizeClassifierConfig({
      custom: { 업무: ["회식", 42, "x"], 운동: ["없는카테고리"] },
    });
    expect(n.custom["업무"]).toEqual(["회식"]); // 42(숫자)·"x"(1글자) 제거
    expect(n.custom["개인"]).toEqual([]);
    expect(n.learned["공부"]).toEqual([]);
    expect(n.custom).not.toHaveProperty("운동");
  });
});

describe("addKeyword / removeKeyword", () => {
  it("사용자 키워드를 custom에 넣는다", () => {
    const { config, added } = addKeyword(emptyConfig(), "업무", "  회식 ");
    expect(added).toEqual(["회식"]);
    expect(config.custom["업무"]).toContain("회식");
  });

  it("이미 아는 키워드(내장 포함)는 추가하지 않는다", () => {
    const { added } = addKeyword(emptyConfig(), "업무", "회의");
    expect(added).toEqual([]);
  });

  it("너무 짧거나 잘못된 카테고리는 무시", () => {
    expect(addKeyword(emptyConfig(), "업무", "x").added).toEqual([]);
    expect(addKeyword(emptyConfig(), "없음", "회식").added).toEqual([]);
  });

  it("removeKeyword는 custom·learned 양쪽에서 지운다", () => {
    let cfg = addKeyword(emptyConfig(), "업무", "회식").config;
    cfg.learned["공부"] = ["코테"];
    cfg = removeKeyword(cfg, "업무", "회식");
    cfg = removeKeyword(cfg, "공부", "코테");
    expect(cfg.custom["업무"]).not.toContain("회식");
    expect(cfg.learned["공부"]).not.toContain("코테");
  });
});

describe("learnFromText", () => {
  it("모르는 후보 1개를 learned에 추가한다", () => {
    const { config, added } = learnFromText(
      emptyConfig(),
      "팀 회식 예약",
      "개인"
    );
    expect(added).toHaveLength(1);
    expect(config.learned["개인"]).toEqual(added);
    // 학습 후에는 그 키워드로 분류가 된다
    const merged = mergeKeywords(KEYWORDS, config.custom, config.learned);
    expect(classifyCategory("회식 장소", merged)).toBe("개인");
  });

  it("이미 다 아는 내용이면 아무것도 학습하지 않는다", () => {
    const { added } = learnFromText(emptyConfig(), "회의", "공부");
    expect(added).toEqual([]);
  });

  it("잘못된 카테고리는 무시", () => {
    expect(learnFromText(emptyConfig(), "회식", "없음").added).toEqual([]);
  });
});
