import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidTask,
  sanitizeTasks,
  loadTasks,
  saveTasks,
  loadPrefs,
  savePrefs,
  loadClassifier,
  saveClassifier,
  loadMemo,
  saveMemo,
  loadSubcats,
  saveSubcats,
  serializeExport,
  parseImport,
  DEFAULT_PREFS,
} from "../src/storage.js";

/** 테스트용 인메모리 스토리지. */
function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const validTask = {
  id: "abc",
  text: "할 일",
  category: "업무",
  completed: false,
  createdAt: 123,
  date: "2026-09-07",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("isValidTask", () => {
  it("올바른 Task는 통과", () => {
    expect(isValidTask(validTask)).toBe(true);
  });

  it.each([
    ["id 없음", { ...validTask, id: 123 }],
    ["빈 id", { ...validTask, id: "" }],
    ["잘못된 카테고리", { ...validTask, category: "운동" }],
    ["completed 문자열", { ...validTask, completed: "false" }],
    ["createdAt NaN", { ...validTask, createdAt: NaN }],
    ["date 없음", { ...validTask, date: undefined }],
    ["date 형식 오류", { ...validTask, date: "2026/09/07" }],
    ["존재하지 않는 날짜", { ...validTask, date: "2026-02-30" }],
    ["잘못된 scope", { ...validTask, scope: "year" }],
    ["null", null],
    ["문자열", "task"],
  ])("%s → false", (_label, value) => {
    expect(isValidTask(value)).toBe(false);
  });

  it("scope는 없거나 day/week/month면 통과", () => {
    expect(isValidTask({ ...validTask, scope: undefined })).toBe(true);
    expect(isValidTask({ ...validTask, scope: "week" })).toBe(true);
    expect(isValidTask({ ...validTask, scope: "month" })).toBe(true);
  });

  it("v4 선택 필드: 유효한 값은 통과", () => {
    expect(
      isValidTask({
        ...validTask,
        status: "doing",
        priority: "high",
        subcategory: "빅데이터",
        endDate: "2026-09-10",
        notes: "메모",
        recurrence: { freq: "weekdays" },
        series: "s1",
      })
    ).toBe(true);
    expect(
      isValidTask({ ...validTask, completed: true, doneAt: 123456 })
    ).toBe(true);
  });

  it.each([
    ["잘못된 status", { ...validTask, status: "later" }],
    ["잘못된 priority", { ...validTask, priority: "urgent" }],
    ["잘못된 endDate", { ...validTask, endDate: "2026/09/10" }],
    ["doneAt 문자열", { ...validTask, doneAt: "now" }],
    ["잘못된 recurrence", { ...validTask, recurrence: { freq: "hourly" } }],
  ])("v4 선택 필드 %s → false", (_l, v) => {
    expect(isValidTask(v)).toBe(false);
  });
});

describe("sanitizeTasks", () => {
  it("유효 항목만 남기고 id 중복을 제거한다", () => {
    const result = sanitizeTasks([
      validTask,
      { ...validTask }, // 중복 id
      { ...validTask, id: "def" },
      { garbage: true },
      null,
    ]);
    expect(result.map((t) => t.id)).toEqual(["abc", "def"]);
  });

  it("배열이 아니면 빈 배열", () => {
    expect(sanitizeTasks("nope")).toEqual([]);
    expect(sanitizeTasks(null)).toEqual([]);
  });

  it("여분 필드는 떨군다", () => {
    const [only] = sanitizeTasks([{ ...validTask, evil: "x" }]);
    expect(Object.keys(only).sort()).toEqual(
      ["category", "completed", "createdAt", "date", "id", "text"].sort()
    );
  });

  it("date 없는 구 스키마는 createdAt 날짜로 마이그레이션한다", () => {
    const legacy = {
      id: "old",
      text: "옛날 할 일",
      category: "개인",
      completed: false,
      createdAt: new Date(2025, 0, 15, 9, 30).getTime(),
    };
    const [migrated] = sanitizeTasks([legacy]);
    expect(migrated.date).toBe("2025-01-15");
  });

  it("date도 createdAt도 못 쓰면 버린다", () => {
    expect(
      sanitizeTasks([{ ...validTask, date: undefined, createdAt: NaN }])
    ).toEqual([]);
  });

  it("scope week/month는 유지, 잘못된 scope는 떼고 항목은 살린다", () => {
    const out = sanitizeTasks([
      { ...validTask, id: "w", scope: "week" },
      { ...validTask, id: "m", scope: "month" },
      { ...validTask, id: "bad", scope: "decade" },
    ]);
    expect(out.find((t) => t.id === "w").scope).toBe("week");
    expect(out.find((t) => t.id === "m").scope).toBe("month");
    const bad = out.find((t) => t.id === "bad");
    expect(bad).toBeTruthy();
    expect("scope" in bad).toBe(false);
  });

  it("v4 선택 필드: 유효하면 유지, 잘못되면 떼고 항목 유지", () => {
    const [ok] = sanitizeTasks([
      {
        ...validTask,
        status: "doing",
        priority: "high",
        subcategory: "  빅데이터 ",
        endDate: "2026-09-10",
        notes: "상세",
      },
    ]);
    expect(ok).toMatchObject({
      status: "doing",
      priority: "high",
      subcategory: "빅데이터",
      endDate: "2026-09-10",
      notes: "상세",
    });

    const [bad] = sanitizeTasks([
      {
        ...validTask,
        status: "later",
        priority: "urgent",
        endDate: "2026-09-05", // date보다 앞 → 제거
        notes: "   ",
      },
    ]);
    expect(bad.id).toBe(validTask.id);
    for (const k of ["status", "priority", "endDate", "notes"]) {
      expect(k in bad).toBe(false);
    }
  });

  it("completed 아니면 doneAt 제거, doing과 completed 모순은 completed 우선", () => {
    const [a] = sanitizeTasks([{ ...validTask, completed: false, doneAt: 123 }]);
    expect("doneAt" in a).toBe(false);
    const [b] = sanitizeTasks([
      { ...validTask, completed: true, status: "doing", doneAt: 999 },
    ]);
    expect(b.completed).toBe(true);
    expect("status" in b).toBe(false);
    expect(b.doneAt).toBe(999);
  });

  it("recurrence 정규화: weekly days 정렬·중복 제거, 잘못된 freq는 제거", () => {
    const [a] = sanitizeTasks([
      {
        ...validTask,
        recurrence: { freq: "weekly", days: [3, 1, 1, 9] },
        series: "s1",
      },
    ]);
    expect(a.recurrence).toEqual({ freq: "weekly", days: [1, 3] });
    const [b] = sanitizeTasks([
      { ...validTask, recurrence: { freq: "yearly" } },
    ]);
    expect("recurrence" in b).toBe(false);
  });
});

describe("loadSubcats / saveSubcats", () => {
  it("값이 없으면 기본 시딩값(업무만 채워짐)", () => {
    const s = loadSubcats(fakeStore());
    expect(s.업무).toContain("빅데이터");
    expect(s.개인).toEqual([]);
  });

  it("저장한 것을 정규화해서 읽는다", () => {
    const store = fakeStore();
    saveSubcats({ 업무: ["  A ", "A", "B"], 개인: [], 공부: ["C"] }, store);
    expect(loadSubcats(store)).toEqual({ 개인: [], 업무: ["A", "B"], 공부: ["C"] });
  });

  it("손상된 JSON이면 경고 후 기본값", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fakeStore({ "task-app.subcategories": "{bad" });
    expect(loadSubcats(store).업무).toContain("빅데이터");
  });
});

describe("loadTasks / saveTasks", () => {
  it("저장한 것을 그대로 읽는다", () => {
    const store = fakeStore();
    saveTasks([validTask], store);
    expect(loadTasks(store)).toEqual([validTask]);
  });

  it("값이 없으면 빈 배열", () => {
    expect(loadTasks(fakeStore())).toEqual([]);
  });

  it("손상된 JSON이면 경고 후 빈 배열", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fakeStore({ "task-app.tasks": "{ not json" });
    expect(loadTasks(store)).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("배열이지만 항목이 손상됐으면 걸러낸다", () => {
    const store = fakeStore({
      "task-app.tasks": JSON.stringify([validTask, { bad: 1 }]),
    });
    expect(loadTasks(store)).toEqual([validTask]);
  });

  it("saveTasks는 스토리지가 던져도 죽지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    };
    expect(() => saveTasks([validTask], throwing)).not.toThrow();
  });
});

describe("loadPrefs / savePrefs", () => {
  it("값이 없으면 기본값", () => {
    expect(loadPrefs(fakeStore())).toEqual(DEFAULT_PREFS);
  });

  it("알 수 없는 값은 기본값으로 보정", () => {
    const store = fakeStore({
      "task-app.prefs": JSON.stringify({
        filter: "운동",
        sort: "random",
        hideCompleted: "yes",
        theme: "neon",
      }),
    });
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
  });

  it("유효한 값은 유지", () => {
    const prefs = {
      filter: "업무",
      sort: "created-asc",
      hideCompleted: true,
      theme: "dark",
      view: "week",
    };
    const store = fakeStore();
    savePrefs(prefs, store);
    expect(loadPrefs(store)).toEqual(prefs);
  });

  it("알 수 없는 view는 기본값(day)으로 보정", () => {
    const store = fakeStore({
      "task-app.prefs": JSON.stringify({ view: "yearly" }),
    });
    expect(loadPrefs(store).view).toBe("day");
  });

  it("view는 day/week/month를 허용", () => {
    for (const v of ["day", "week", "month"]) {
      const store = fakeStore({
        "task-app.prefs": JSON.stringify({ view: v }),
      });
      expect(loadPrefs(store).view).toBe(v);
    }
  });
});

describe("loadMemo / saveMemo", () => {
  it("값이 없으면 빈 문자열", () => {
    expect(loadMemo(fakeStore())).toBe("");
  });

  it("저장한 문자열을 그대로 읽는다", () => {
    const store = fakeStore();
    saveMemo("우유 사기\n택배 확인", store);
    expect(loadMemo(store)).toBe("우유 사기\n택배 확인");
  });

  it("스토리지가 던져도 죽지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(() => saveMemo("x", throwing)).not.toThrow();
    expect(loadMemo(throwing)).toBe("");
  });
});

describe("serializeExport / parseImport (왕복)", () => {
  it("내보낸 것을 다시 가져올 수 있다", () => {
    const tasks = [validTask, { ...validTask, id: "def", completed: true }];
    const memo = "테스트 메모";
    const subcats = { 개인: [], 업무: { 빅데이터: [] }, 공부: [] };
    const json = serializeExport(tasks, memo, subcats);
    const result = parseImport(json);
    expect(result).toEqual({ ok: true, tasks, memo, subcategories: subcats });
  });

  it("내보내기 JSON에 appVersion·스키마 버전이 들어간다", () => {
    const meta = JSON.parse(serializeExport([validTask]));
    expect(meta.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta.version).toBe(5);
  });

  it("최상위 배열도 받는다", () => {
    expect(parseImport(JSON.stringify([validTask]))).toMatchObject({
      ok: true,
      tasks: [validTask],
    });
  });

  it("JSON이 아니면 실패", () => {
    expect(parseImport("<xml>")).toMatchObject({ ok: false });
  });

  it("배열이 없으면 실패", () => {
    expect(parseImport(JSON.stringify({ foo: 1 }))).toMatchObject({
      ok: false,
    });
  });

  it("유효한 항목이 하나도 없으면 실패", () => {
    expect(parseImport(JSON.stringify([{ bad: 1 }]))).toMatchObject({
      ok: false,
    });
  });
});

describe("loadClassifier / saveClassifier", () => {
  it("값이 없으면 빈 custom/learned", () => {
    const cfg = loadClassifier(fakeStore());
    expect(cfg.custom).toEqual({ 개인: [], 업무: [], 공부: [] });
    expect(cfg.learned).toEqual({ 개인: [], 업무: [], 공부: [] });
  });

  it("저장한 것을 정규화해서 읽는다", () => {
    const store = fakeStore();
    saveClassifier(
      { custom: { 업무: ["회식", "회식"] }, learned: { 공부: ["코테"] } },
      store
    );
    const cfg = loadClassifier(store);
    expect(cfg.custom["업무"]).toEqual(["회식"]); // 중복 제거
    expect(cfg.learned["공부"]).toEqual(["코테"]);
  });

  it("손상된 JSON이면 경고 후 빈 설정", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fakeStore({ "task-app.classifier": "{oops" });
    expect(loadClassifier(store).custom["개인"]).toEqual([]);
  });

  it("스토리지가 던져도 죽지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("nope");
      },
      removeItem: () => {},
    };
    expect(() =>
      saveClassifier({ custom: {}, learned: {} }, throwing)
    ).not.toThrow();
  });
});
