import { describe, it, expect } from "vitest";
import {
  DEFAULT_SUBCATS,
  normalizeSubcats,
  subcatsOf,
  addSubcat,
  removeSubcat,
  renameSubcat,
} from "../src/subcats.js";

describe("normalizeSubcats", () => {
  it("카테고리 3종 고정 + trim·중복 제거", () => {
    const n = normalizeSubcats({
      업무: {
        "  빅데이터 ": [" 로케이션찾기 ", "로케이션찾기"],
        UT일반: [],
      },
      개인: "not-array",
      없는카테고리: ["x"],
    });
    expect(Object.keys(n).sort()).toEqual(["개인", "공부", "업무"]);
    expect(n.업무).toEqual({
      빅데이터: ["로케이션찾기"],
      UT일반: [],
    });
    expect(n.개인).toEqual([]);
  });

  it("기본 시딩값은 업무만 채워져 있다", () => {
    const n = normalizeSubcats(DEFAULT_SUBCATS);
    expect(Object.keys(n.업무)).toContain("빅데이터");
    expect(n.개인).toEqual([]);
    expect(n.공부).toEqual([]);
  });
});

describe("add / remove / rename", () => {
  const base = normalizeSubcats({ 업무: { 빅데이터: [] }, 개인: [], 공부: [] });

  it("addSubcat", () => {
    const { map, added } = addSubcat(base, "업무", "  AI/자동화 ");
    expect(added).toBe(true);
    expect(subcatsOf(map, "업무")).toEqual(["빅데이터", "AI/자동화"]);
    expect(addSubcat(map, "업무", "빅데이터").added).toBe(false);
    expect(addSubcat(base, "없음", "x").added).toBe(false);
  });

  it("removeSubcat", () => {
    expect(subcatsOf(removeSubcat(base, "업무", "빅데이터"), "업무")).toEqual([]);
    expect(removeSubcat(base, "업무", "없는거")).toBe(base);
  });

  it("renameSubcat", () => {
    const { map, renamed } = renameSubcat(base, "업무", "빅데이터", "데이터");
    expect(renamed).toBe(true);
    expect(subcatsOf(map, "업무")).toEqual(["데이터"]);
    // 중복 이름으로는 변경 불가
    const two = addSubcat(base, "업무", "AI").map;
    expect(renameSubcat(two, "업무", "AI", "빅데이터").renamed).toBe(false);
  });
});
