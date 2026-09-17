import { describe, it, expect } from "vitest";
import {
  renameSubcat,
  normalizeSubcats,
  subcatsOf,
} from "../src/subcats.js";

describe("세부분류 이름 변경", () => {
  it("업무 부모 이름 변경 후 관련 할 일 마이그레이션", () => {
    const map = {
      개인: [],
      업무: {
        빅데이터: ["로케이션찾기"],
        "AI/자동화": [],
      },
      공부: [],
    };

    const tasks = [
      {
        id: 1,
        text: "AI 모델 학습",
        category: "업무",
        subcategory: "AI/자동화",
        completed: false,
        createdAt: 1609459200000,
        date: "2024-01-01",
      },
      {
        id: 2,
        text: "자동화 스크립트",
        category: "업무",
        subcategory: "AI/자동화",
        completed: false,
        createdAt: 1609459200000,
        date: "2024-01-01",
      },
    ];

    // 부모 이름 "AI/자동화" -> "AI자동화"로 변경
    const { map: newMap, renamed } = renameSubcat(map, "업무", "AI/자동화", "AI자동화");
    expect(renamed).toBe(true);
    expect(newMap.업무["AI자동화"]).toBeDefined();
    expect(newMap.업무["AI/자동화"]).toBeUndefined();

    // 할 일의 subcategory도 업데이트되어야 함
    // "AI/자동화" -> "AI자동화"
    const migratedTasks = tasks.map((task) => {
      if (task.subcategory === "AI/자동화") {
        return { ...task, subcategory: "AI자동화" };
      }
      return task;
    });

    expect(migratedTasks[0].subcategory).toBe("AI자동화");
    expect(migratedTasks[1].subcategory).toBe("AI자동화");
  });

  it("업무 자식 이름 변경 후 관련 할 일 마이그레이션", () => {
    const map = {
      개인: [],
      업무: {
        빅데이터: ["로케이션찾기", "이슈분석"],
      },
      공부: [],
    };

    const tasks = [
      {
        id: 1,
        text: "위치 분석",
        category: "업무",
        subcategory: "빅데이터/로케이션찾기",
        completed: false,
        createdAt: 1609459200000,
        date: "2024-01-01",
      },
    ];

    // 자식 이름 "로케이션찾기" -> "위치분석"으로 변경
    const { map: newMap, renamed } = renameSubcat(
      map,
      "업무",
      "로케이션찾기",
      "위치분석",
      "빅데이터"
    );
    expect(renamed).toBe(true);
    expect(newMap.업무.빅데이터).toContain("위치분석");
    expect(newMap.업무.빅데이터).not.toContain("로케이션찾기");

    // 할 일의 subcategory도 업데이트되어야 함
    // "빅데이터/로케이션찾기" -> "빅데이터/위치분석"
    const migratedTasks = tasks.map((task) => {
      if (task.category === "업무" && task.subcategory.startsWith("빅데이터/")) {
        const [parent, child] = task.subcategory.split("/");
        if (child === "로케이션찾기") {
          return { ...task, subcategory: `${parent}/위치분석` };
        }
      }
      return task;
    });

    expect(migratedTasks[0].subcategory).toBe("빅데이터/위치분석");
  });
});
