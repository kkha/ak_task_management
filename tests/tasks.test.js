import { describe, it, expect } from "vitest";
import {
  createTask,
  addTask,
  toggleTask,
  deleteTask,
  editTask,
  reorderTask,
  moveTask,
  sortTasks,
  visibleTasks,
  parseFilter,
  progress,
  tasksOnDay,
  tasksInWeek,
  tasksInMonth,
  countByDate,
  countByFilter,
  countBySubcat,
  taskScope,
  taskStatus,
  taskPriority,
  taskEndDate,
  setTaskStatus,
  setTaskPriority,
  setTaskNotes,
  rescheduleTask,
  expandRecurrence,
  buildSeries,
  topUpSeries,
  seriesSiblings,
  deleteSeriesFrom,
  recurrenceLabel,
  historyEntries,
} from "../src/tasks.js";
import { todayISODate, addDays } from "../src/dates.js";

const t = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  text: over.text ?? "할 일",
  category: over.category ?? "개인",
  completed: over.completed ?? false,
  createdAt: over.createdAt ?? 1000,
  date: over.date ?? "2026-09-07",
  ...over,
});

describe("createTask", () => {
  it("스키마대로 만들고 text를 trim한다", () => {
    const task = createTask("  숨쉬기  ", "업무");
    expect(task).toMatchObject({
      text: "숨쉬기",
      category: "업무",
      completed: false,
    });
    expect(typeof task.id).toBe("string");
    expect(typeof task.createdAt).toBe("number");
  });

  it("알 수 없는 카테고리는 첫 카테고리로 보정한다", () => {
    expect(createTask("x", "없는카테고리").category).toBe("개인");
  });

  it("date를 명시하면 그 날짜, 없으면 오늘", () => {
    expect(createTask("x", "개인", "2026-01-02").date).toBe("2026-01-02");
    expect(createTask("x", "개인").date).toBe(todayISODate());
    expect(createTask("x", "개인", "bad-date").date).toBe(todayISODate());
  });

  it("scope: day면 필드 생략, week/month면 그대로", () => {
    expect("scope" in createTask("x", "개인", "2026-09-07")).toBe(false);
    expect("scope" in createTask("x", "개인", "2026-09-07", "day")).toBe(false);
    expect(createTask("x", "개인", "2026-09-07", "week").scope).toBe("week");
    expect(createTask("x", "개인", "2026-09-07", "month").scope).toBe("month");
  });
});

describe("taskScope", () => {
  it("scope 없음/잘못됨 → day", () => {
    expect(taskScope({})).toBe("day");
    expect(taskScope({ scope: "year" })).toBe("day");
    expect(taskScope({ scope: "week" })).toBe("week");
  });
});

describe("addTask", () => {
  it("맨 앞에 추가한다", () => {
    const a = t({ id: "a" });
    const next = addTask([a], "새 할 일", "공부");
    expect(next).toHaveLength(2);
    expect(next[0].text).toBe("새 할 일");
    expect(next[1]).toBe(a);
  });

  it("공백만 입력하면 원본을 그대로 반환한다", () => {
    const list = [t()];
    expect(addTask(list, "   ", "개인")).toBe(list);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const list = [t()];
    addTask(list, "x", "개인");
    expect(list).toHaveLength(1);
  });
});

describe("toggleTask / deleteTask / editTask", () => {
  it("toggleTask는 해당 항목만 뒤집는다", () => {
    const [a, b] = [t({ id: "a" }), t({ id: "b" })];
    const next = toggleTask([a, b], "a");
    expect(next[0].completed).toBe(true);
    expect(next[1]).toBe(b);
  });

  it("deleteTask는 해당 항목을 제거한다", () => {
    const next = deleteTask([t({ id: "a" }), t({ id: "b" })], "a");
    expect(next.map((x) => x.id)).toEqual(["b"]);
  });

  it("editTask는 text/category를 바꾼다", () => {
    const next = editTask([t({ id: "a" })], "a", "  수정됨 ", "업무");
    expect(next[0]).toMatchObject({ text: "수정됨", category: "업무" });
  });

  it("editTask는 빈 텍스트면 원본을 반환한다", () => {
    const list = [t({ id: "a" })];
    expect(editTask(list, "a", "   ", "업무")).toBe(list);
  });
});

describe("reorderTask", () => {
  const list = [t({ id: "a" }), t({ id: "b" }), t({ id: "c" })];

  it("before로 이동", () => {
    expect(reorderTask(list, "c", "a", "before").map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("after로 이동", () => {
    expect(reorderTask(list, "a", "c", "after").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("같은 id면 원본 반환", () => {
    expect(reorderTask(list, "a", "a")).toBe(list);
  });

  it("없는 id면 원본 반환", () => {
    expect(reorderTask(list, "z", "a")).toBe(list);
  });
});

describe("moveTask", () => {
  const list = [t({ id: "a" }), t({ id: "b" }), t({ id: "c" })];
  it("위로 이동", () => {
    expect(moveTask(list, "b", -1).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("아래로 이동", () => {
    expect(moveTask(list, "b", 1).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("경계 밖이면 원본 반환", () => {
    expect(moveTask(list, "a", -1)).toBe(list);
    expect(moveTask(list, "c", 1)).toBe(list);
  });
});

describe("sortTasks", () => {
  const list = [
    t({ id: "old-work", category: "업무", createdAt: 100, completed: true }),
    t({ id: "new-personal", category: "개인", createdAt: 300 }),
    t({ id: "mid-study", category: "공부", createdAt: 200 }),
  ];

  it("manual은 순서를 유지한다", () => {
    expect(sortTasks(list, "manual").map((x) => x.id)).toEqual(
      list.map((x) => x.id)
    );
  });

  it("created-desc / created-asc", () => {
    expect(sortTasks(list, "created-desc").map((x) => x.createdAt)).toEqual([
      300, 200, 100,
    ]);
    expect(sortTasks(list, "created-asc").map((x) => x.createdAt)).toEqual([
      100, 200, 300,
    ]);
  });

  it("date-asc는 날짜 오름차순 (동일 날짜는 오래된순)", () => {
    const byDate = [
      t({ id: "d9", date: "2026-09-09", createdAt: 5 }),
      t({ id: "d7b", date: "2026-09-07", createdAt: 20 }),
      t({ id: "d7a", date: "2026-09-07", createdAt: 10 }),
    ];
    expect(sortTasks(byDate, "date-asc").map((x) => x.id)).toEqual([
      "d7a",
      "d7b",
      "d9",
    ]);
  });

  it("category는 개인→업무→공부 순", () => {
    expect(sortTasks(list, "category").map((x) => x.category)).toEqual([
      "개인",
      "업무",
      "공부",
    ]);
  });

  it("active-first는 미완료를 먼저", () => {
    expect(sortTasks(list, "active-first")[2].id).toBe("old-work");
  });

  it("원본을 변형하지 않는다", () => {
    sortTasks(list, "created-asc");
    expect(list[0].id).toBe("old-work");
  });
});

describe("visibleTasks", () => {
  const list = [
    t({ id: "a", category: "개인", completed: true }),
    t({ id: "b", category: "업무", completed: false }),
    t({ id: "c", category: "개인", completed: false }),
  ];

  it("전체 필터 + 숨김 없음", () => {
    expect(visibleTasks(list, { filter: "전체" })).toHaveLength(3);
  });

  it("카테고리 필터", () => {
    expect(visibleTasks(list, { filter: "개인" }).map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("완료 숨김", () => {
    expect(
      visibleTasks(list, { filter: "전체", hideCompleted: true }).map(
        (x) => x.id
      )
    ).toEqual(["b", "c"]);
  });

  it("필터 + 숨김 동시", () => {
    expect(
      visibleTasks(list, { filter: "개인", hideCompleted: true }).map(
        (x) => x.id
      )
    ).toEqual(["c"]);
  });
});

describe("tasksOnDay / tasksInWeek / countByDate", () => {
  // 2026-09-07은 월요일. 그 주 일요일 = 09-06, 토요일 = 09-12.
  const list = [
    t({ id: "sun", date: "2026-09-06" }),
    t({ id: "mon", date: "2026-09-07", completed: true }),
    t({ id: "mon2", date: "2026-09-07" }),
    t({ id: "sat", date: "2026-09-12" }),
    t({ id: "next", date: "2026-09-13" }),
  ];

  it("tasksOnDay는 그 날짜만", () => {
    expect(tasksOnDay(list, "2026-09-07").map((x) => x.id)).toEqual([
      "mon",
      "mon2",
    ]);
  });

  it("tasksInWeek는 일~토 범위(경계 포함, 다음 주 제외)", () => {
    expect(tasksInWeek(list, "2026-09-07").map((x) => x.id)).toEqual([
      "sun",
      "mon",
      "mon2",
      "sat",
    ]);
  });

  it("tasksInWeek는 주 안의 어느 날짜를 기준으로 해도 같은 결과", () => {
    expect(tasksInWeek(list, "2026-09-12").map((x) => x.id)).toEqual(
      tasksInWeek(list, "2026-09-06").map((x) => x.id)
    );
  });

  it("countByDate는 날짜별 total/done", () => {
    expect(countByDate(list)["2026-09-07"]).toEqual({ total: 2, done: 1 });
    expect(countByDate(list)["2026-09-06"]).toEqual({ total: 1, done: 0 });
  });

  it("tasksInMonth는 같은 달만 (앞 7자 비교)", () => {
    const m = [
      t({ id: "a", date: "2026-08-31" }),
      t({ id: "b", date: "2026-09-01" }),
      t({ id: "c", date: "2026-09-30" }),
      t({ id: "d", date: "2026-10-01" }),
    ];
    expect(tasksInMonth(m, "2026-09-15").map((x) => x.id)).toEqual(["b", "c"]);
  });

  describe("scope (주/월 계획)", () => {
    const s = [
      t({ id: "day", date: "2026-09-08" }),
      t({ id: "wk", date: "2026-09-09", scope: "week" }),
      t({ id: "mo", date: "2026-09-10", scope: "month" }),
    ];

    it("tasksOnDay는 day 스코프만 (주·월 계획 제외)", () => {
      expect(tasksOnDay(s, "2026-09-09").map((x) => x.id)).toEqual([]);
      expect(tasksOnDay(s, "2026-09-08").map((x) => x.id)).toEqual(["day"]);
    });

    it("tasksInWeek는 day + 그 주 계획, 월 계획은 제외", () => {
      expect(tasksInWeek(s, "2026-09-08").map((x) => x.id).sort()).toEqual([
        "day",
        "wk",
      ]);
    });

    it("tasksInMonth는 day + 주 계획 + 월 계획 전부", () => {
      expect(tasksInMonth(s, "2026-09-01").map((x) => x.id).sort()).toEqual([
        "day",
        "mo",
        "wk",
      ]);
    });

    it("countByDate는 day 스코프만 센다(달력 마커)", () => {
      const c = countByDate(s);
      expect(c["2026-09-08"]).toEqual({ total: 1, done: 0 });
      expect(c["2026-09-09"]).toBeUndefined();
      expect(c["2026-09-10"]).toBeUndefined();
    });
  });
});

describe("countByFilter", () => {
  it("전체 + 카테고리별 개수 (완료 여부·필터 무관)", () => {
    const list = [
      t({ category: "개인" }),
      t({ category: "업무", completed: true }),
      t({ category: "업무" }),
      t({ category: "업무" }),
    ];
    expect(countByFilter(list)).toEqual({ 전체: 4, 개인: 1, 업무: 3, 공부: 0 });
  });

  it("빈 목록은 전부 0", () => {
    expect(countByFilter([])).toEqual({ 전체: 0, 개인: 0, 업무: 0, 공부: 0 });
  });
});

describe("countBySubcat", () => {
  it("카테고리별 세부분류 + 미분류 집계", () => {
    const list = [
      t({ category: "업무", subcategory: "빅데이터" }),
      t({ category: "업무", subcategory: "빅데이터" }),
      t({ category: "업무", subcategory: "UT과제" }),
      t({ category: "업무" }),
      t({ category: "개인" }),
    ];
    const c = countBySubcat(list);
    expect(c.전체).toBe(5);
    expect(c.업무).toMatchObject({ 전체: 4, 미분류: 1, 빅데이터: 2, UT과제: 1 });
    expect(c.개인).toMatchObject({ 전체: 1, 미분류: 1 });
  });
});

/* ── v4: 상태 / 우선순위 / 메모 ─────────────────────────────── */

describe("taskStatus / setTaskStatus", () => {
  it("completed면 done, status='doing'이면 doing, 나머지 todo", () => {
    expect(taskStatus(t({ completed: true }))).toBe("done");
    expect(taskStatus(t({ status: "doing" }))).toBe("doing");
    expect(taskStatus(t())).toBe("todo");
  });

  it("setTaskStatus는 completed·doneAt·status를 일관되게 유지한다", () => {
    const list = [t({ id: "a" })];
    const doing = setTaskStatus(list, "a", "doing");
    expect(doing[0]).toMatchObject({ completed: false, status: "doing" });
    expect(doing[0].doneAt).toBeUndefined();

    const done = setTaskStatus(doing, "a", "done");
    expect(done[0].completed).toBe(true);
    expect(typeof done[0].doneAt).toBe("number");
    expect(done[0].status).toBeUndefined();

    const todo = setTaskStatus(done, "a", "todo");
    expect(todo[0]).toMatchObject({ completed: false });
    expect(todo[0].doneAt).toBeUndefined();
    expect(todo[0].status).toBeUndefined();
  });

  it("이미 완료된 항목을 다시 done으로 두면 doneAt 유지", () => {
    const list = [t({ id: "a", completed: true, doneAt: 999 })];
    expect(setTaskStatus(list, "a", "done")[0].doneAt).toBe(999);
  });
});

describe("toggleTask (v4: doneAt)", () => {
  it("완료 시 doneAt 기록, 해제 시 제거", () => {
    const done = toggleTask([t({ id: "a" })], "a");
    expect(done[0].completed).toBe(true);
    expect(typeof done[0].doneAt).toBe("number");
    const undone = toggleTask(done, "a");
    expect(undone[0].completed).toBe(false);
    expect(undone[0].doneAt).toBeUndefined();
  });
});

describe("taskPriority / setTaskPriority", () => {
  it("기본 normal, high/low만 저장", () => {
    expect(taskPriority(t())).toBe("normal");
    expect(taskPriority(t({ priority: "high" }))).toBe("high");
    const list = setTaskPriority([t({ id: "a", priority: "high" })], "a", "normal");
    expect(list[0].priority).toBeUndefined();
    expect(setTaskPriority([t({ id: "a" })], "a", "low")[0].priority).toBe("low");
  });
});

describe("setTaskNotes", () => {
  it("내용 있으면 저장, 공백뿐이면 제거", () => {
    const withNotes = setTaskNotes([t({ id: "a" })], "a", "상세 내용");
    expect(withNotes[0].notes).toBe("상세 내용");
    expect(setTaskNotes(withNotes, "a", "   ")[0].notes).toBeUndefined();
  });
});

describe("sortTasks: priority", () => {
  it("높음 → 보통 → 낮음", () => {
    const list = [
      t({ id: "n", createdAt: 3 }),
      t({ id: "lo", priority: "low", createdAt: 2 }),
      t({ id: "hi", priority: "high", createdAt: 1 }),
    ];
    expect(sortTasks(list, "priority").map((x) => x.id)).toEqual([
      "hi",
      "n",
      "lo",
    ]);
  });
});

/* ── v4: 여러 날 / 재배치 ─────────────────────────────────────── */

describe("여러 날 (endDate)", () => {
  const list = [t({ id: "span", date: "2026-09-08", endDate: "2026-09-10" })];

  it("taskEndDate는 endDate가 유효하면 그것, 아니면 date", () => {
    expect(taskEndDate(list[0])).toBe("2026-09-10");
    expect(taskEndDate(t({ date: "2026-09-08" }))).toBe("2026-09-08");
    expect(taskEndDate(t({ date: "2026-09-08", endDate: "2026-09-07" }))).toBe(
      "2026-09-08"
    );
  });

  it("tasksOnDay는 span 안의 모든 날에 나타난다", () => {
    for (const d of ["2026-09-08", "2026-09-09", "2026-09-10"]) {
      expect(tasksOnDay(list, d).map((x) => x.id)).toEqual(["span"]);
    }
    expect(tasksOnDay(list, "2026-09-11")).toEqual([]);
  });

  it("countByDate는 span의 각 날을 센다", () => {
    const c = countByDate(list);
    expect(c["2026-09-08"]).toEqual({ total: 1, done: 0 });
    expect(c["2026-09-10"]).toEqual({ total: 1, done: 0 });
    expect(c["2026-09-11"]).toBeUndefined();
  });
});

describe("rescheduleTask", () => {
  it("날짜 변경", () => {
    const r = rescheduleTask([t({ id: "a" })], "a", { date: "2026-09-20" });
    expect(r[0].date).toBe("2026-09-20");
  });

  it("주별 계획을 특정 날 일별로 할당", () => {
    const r = rescheduleTask([t({ id: "a", scope: "week" })], "a", {
      scope: "day",
      date: "2026-09-09",
    });
    expect(r[0].scope).toBeUndefined();
    expect(r[0].date).toBe("2026-09-09");
  });

  it("endDate 설정·해제, date를 당기면 무의미한 endDate 정리", () => {
    let r = rescheduleTask([t({ id: "a", date: "2026-09-08" })], "a", {
      endDate: "2026-09-10",
    });
    expect(r[0].endDate).toBe("2026-09-10");
    r = rescheduleTask(r, "a", { endDate: null });
    expect(r[0].endDate).toBeUndefined();
    r = rescheduleTask([t({ id: "a", date: "2026-09-08", endDate: "2026-09-10" })], "a", {
      date: "2026-09-12",
    });
    expect(r[0].endDate).toBeUndefined();
  });
});

/* ── v4: 필터(세부분류) ──────────────────────────────────────── */

describe("parseFilter / visibleTasks (세부분류)", () => {
  it("parseFilter", () => {
    expect(parseFilter("전체")).toEqual({ cat: null, sub: null });
    expect(parseFilter("업무")).toEqual({ cat: "업무", sub: null });
    expect(parseFilter("업무/빅데이터")).toEqual({ cat: "업무", sub: "빅데이터" });
    expect(parseFilter("업무/")).toEqual({ cat: "업무", sub: "" });
  });

  it("visibleTasks: 카테고리·세부분류·미분류 필터", () => {
    const list = [
      t({ id: "a", category: "업무", subcategory: "빅데이터" }),
      t({ id: "b", category: "업무" }),
      t({ id: "c", category: "개인" }),
    ];
    expect(visibleTasks(list, { filter: "업무" }).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
    expect(
      visibleTasks(list, { filter: "업무/빅데이터" }).map((x) => x.id)
    ).toEqual(["a"]);
    expect(visibleTasks(list, { filter: "업무/" }).map((x) => x.id)).toEqual([
      "b",
    ]);
  });
});

/* ── v4: 반복 ────────────────────────────────────────────────── */

describe("expandRecurrence / buildSeries / topUpSeries", () => {
  it("expandRecurrence: 매일 / 평일 / 매주", () => {
    // 2026-09-07(월) ~ 2026-09-13(일)
    expect(
      expandRecurrence("2026-09-07", { freq: "daily" }, "2026-09-13")
    ).toHaveLength(7);
    expect(
      expandRecurrence("2026-09-07", { freq: "weekdays" }, "2026-09-13")
    ).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
    // 매주 월요일 (dow 1)
    expect(
      expandRecurrence(
        "2026-09-07",
        { freq: "weekly", days: [1] },
        "2026-09-21"
      )
    ).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("buildSeries: 인스턴스마다 새 id + 같은 series + 필드 복제", () => {
    const items = buildSeries(
      { text: "스탠드업", category: "업무", date: "2026-09-07", priority: "high" },
      { freq: "weekdays" },
      "2026-09-11"
    );
    expect(items).toHaveLength(5);
    expect(new Set(items.map((x) => x.id)).size).toBe(5);
    expect(new Set(items.map((x) => x.series)).size).toBe(1);
    expect(items.every((x) => x.priority === "high" && x.recurrence.freq === "weekdays")).toBe(
      true
    );
  });

  it("topUpSeries: 열린 시리즈를 horizon까지 연장, 중복 없음", () => {
    const today = "2026-09-07";
    const base = buildSeries(
      { text: "운동", category: "개인", date: today },
      { freq: "daily" },
      addDays(today, 10) // 처음엔 10일치만
    );
    expect(base).toHaveLength(11);
    const topped = topUpSeries(base, today, 20);
    expect(topped.length).toBe(21); // today + 20일
    // 날짜 중복 없음
    expect(new Set(topped.map((x) => x.date)).size).toBe(topped.length);
  });

  it("topUpSeries: until 지난 시리즈는 연장하지 않는다", () => {
    const today = "2026-09-07";
    const done = buildSeries(
      { text: "끝난 반복", category: "개인", date: "2026-09-01" },
      { freq: "daily", until: "2026-09-05" },
      "2026-09-30"
    );
    expect(topUpSeries(done, today, 30)).toBe(done);
  });

  it("seriesSiblings / deleteSeriesFrom", () => {
    const s = buildSeries(
      { text: "x", category: "개인", date: "2026-09-07" },
      { freq: "daily" },
      "2026-09-11"
    );
    const sid = s[0].series;
    expect(seriesSiblings(s, sid, { from: "2026-09-09" })).toHaveLength(3);
    expect(deleteSeriesFrom(s, sid, "2026-09-09")).toHaveLength(2);
    expect(deleteSeriesFrom(s, sid)).toHaveLength(0);
  });

  it("recurrenceLabel", () => {
    expect(recurrenceLabel({ freq: "daily" })).toBe("매일");
    expect(recurrenceLabel({ freq: "weekdays" })).toBe("평일");
    expect(recurrenceLabel({ freq: "weekly", days: [1, 3] })).toBe("매주 월·수");
  });
});

/* ── v4: 히스토리 ────────────────────────────────────────────── */

describe("historyEntries", () => {
  const mk = (id, done, doneAt, text = "할 일") =>
    t({ id, text, completed: done, ...(doneAt ? { doneAt } : {}) });
  const D = (iso) => new Date(iso + "T12:00:00").getTime();

  it("완료 항목만, doneAt 내림차순, doneAt 없으면 createdAt", () => {
    const list = [
      mk("a", true, D("2026-09-05")),
      mk("b", false),
      t({ id: "c", completed: true, createdAt: D("2026-09-03") }), // doneAt 없음
      mk("d", true, D("2026-09-08")),
    ];
    expect(historyEntries(list).map((x) => x.id)).toEqual(["d", "a", "c"]);
  });

  it("query·기간 필터", () => {
    const list = [
      mk("a", true, D("2026-09-05"), "보고서 작성"),
      mk("b", true, D("2026-09-09"), "우유 사기"),
    ];
    expect(historyEntries(list, { query: "보고서" }).map((x) => x.id)).toEqual([
      "a",
    ]);
    expect(
      historyEntries(list, { from: "2026-09-08" }).map((x) => x.id)
    ).toEqual(["b"]);
  });
});

describe("progress", () => {
  it("빈 목록은 0%", () => {
    expect(progress([])).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it("완료 비율을 반올림한다", () => {
    const list = [
      t({ completed: true }),
      t({ completed: false }),
      t({ completed: false }),
    ];
    expect(progress(list)).toEqual({ total: 3, done: 1, percent: 33 });
  });

  it("전부 완료면 100%", () => {
    expect(progress([t({ completed: true })]).percent).toBe(100);
  });
});
