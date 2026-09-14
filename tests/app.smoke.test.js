// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  todayISODate,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
} from "../src/dates.js";

// vitest는 프로젝트 루트에서 실행된다.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const bodyInner = html
  .replace(/[\s\S]*<body>/, "")
  .replace(/<\/body>[\s\S]*/, "");

/**
 * index.html의 실제 마크업 위에서 main.js를 구동해, DOM 배선이 깨지지 않고
 * 핵심 사용자 흐름(추가 → 완료 → 진행률)이 동작하는지 확인하는 스모크 테스트.
 */
describe("app 스모크", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = bodyInner;
    // jsdom에는 없는 API 보강
    globalThis.requestAnimationFrame = (cb) => cb();
    if (!globalThis.crypto?.randomUUID) {
      globalThis.crypto = {
        randomUUID: () => "u_" + Math.random().toString(36).slice(2),
      };
    }
  });

  it("초기 로드 시 에러 없이 빈 상태를 그린다", async () => {
    await import("../src/main.js");
    expect(document.querySelector("#progress-text").textContent).toBe(
      "할 일이 없습니다"
    );
    expect(document.querySelector(".task-list__empty")).toBeTruthy();
    expect(document.querySelectorAll("#sort-select option")).toHaveLength(7);
    expect(document.querySelectorAll("#category-select option")).toHaveLength(
      3
    );
  });

  it("할 일을 추가하면 목록과 진행률에 반영되고 localStorage에 저장된다", async () => {
    await import("../src/main.js");
    const form = document.querySelector("#task-form");
    document.querySelector("#task-input").value = "테스트 할 일";
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );

    const items = document.querySelectorAll("#task-list li[data-id]");
    expect(items).toHaveLength(1);
    expect(items[0].querySelector(".task__text").textContent).toBe(
      "테스트 할 일"
    );
    expect(JSON.parse(localStorage.getItem("task-app.tasks"))).toHaveLength(1);

    // 완료 토글 → 진행률 100%
    items[0].querySelector(".task-check").click();
    expect(document.querySelector("#progress-percent").textContent).toBe(
      "100%"
    );
  });

  it("완료 숨기기 토글이 목록을 거른다", async () => {
    const today = todayISODate();
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "a",
          text: "완료됨",
          category: "개인",
          completed: true,
          createdAt: 1,
          date: today,
        },
        {
          id: "b",
          text: "안됨",
          category: "개인",
          completed: false,
          createdAt: 2,
          date: today,
        },
      ])
    );
    await import("../src/main.js");

    // 분류 트리 개수 (완료 숨김과 무관한 "등록된 갯수")
    const treeCount = (f) =>
      document
        .querySelector(`#category-tree button[data-filter="${f}"]`)
        .querySelector(".cat-tree__count").textContent;
    expect(treeCount("전체")).toBe("2");
    expect(treeCount("개인")).toBe("2");
    expect(treeCount("공부")).toBe("0");

    const hide = document.querySelector("#hide-completed");
    hide.checked = true;
    hide.dispatchEvent(new Event("change", { bubbles: true }));

    const visible = [...document.querySelectorAll("#task-list li[data-id]")];
    expect(visible.map((li) => li.dataset.id)).toEqual(["b"]);
    expect(document.querySelector("#filter-notice").hidden).toBe(false);
    // 완료를 숨겨도 트리 개수는 그대로
    expect(treeCount("전체")).toBe("2");
  });

  it("분류 트리에서 카테고리·세부분류를 클릭하면 목록이 필터된다", async () => {
    const today = todayISODate();
    localStorage.setItem(
      "task-app.subcategories",
      JSON.stringify({ 개인: [], 업무: ["빅데이터"], 공부: [] })
    );
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "w1",
          text: "빅데이터 파이프라인",
          category: "업무",
          subcategory: "빅데이터",
          completed: false,
          createdAt: 2,
          date: today,
        },
        {
          id: "w2",
          text: "회의록 정리",
          category: "업무",
          completed: false,
          createdAt: 1,
          date: today,
        },
        {
          id: "p1",
          text: "장보기",
          category: "개인",
          completed: false,
          createdAt: 3,
          date: today,
        },
      ])
    );
    await import("../src/main.js");

    const ids = () =>
      [...document.querySelectorAll("#task-list li[data-id]")]
        .map((li) => li.dataset.id)
        .sort();

    expect(ids()).toEqual(["p1", "w1", "w2"]);

    document
      .querySelector('#category-tree button[data-filter="업무"]')
      .click();
    expect(ids()).toEqual(["w1", "w2"]);

    document
      .querySelector('#category-tree button[data-filter="업무/빅데이터"]')
      .click();
    expect(ids()).toEqual(["w1"]);
    expect(document.querySelector("#active-filter").hidden).toBe(false);

    document.querySelector("#active-filter").click();
    expect(ids()).toEqual(["p1", "w1", "w2"]);
  });

  it("진행중 토글 / 우선순위 / 상세메모가 저장된다", async () => {
    const today = todayISODate();
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "a",
          text: "보고서",
          category: "업무",
          completed: false,
          createdAt: 1,
          date: today,
        },
      ])
    );
    await import("../src/main.js");
    const li = () => document.querySelector("#task-list li[data-id='a']");

    // 진행중 토글
    li().querySelector(".task-doing").click();
    expect(li().classList.contains("task--doing")).toBe(true);
    expect(JSON.parse(localStorage.getItem("task-app.tasks"))[0].status).toBe(
      "doing"
    );
    li().querySelector(".task-doing").click(); // 해제
    expect("status" in JSON.parse(localStorage.getItem("task-app.tasks"))[0]).toBe(
      false
    );

    // 우선순위 (편집 카드)
    li().querySelector(".task-edit").click();
    const card = document.querySelector("#task-list .task--editing");
    card.querySelector(".edit-priority").value = "high";
    card.querySelector(".edit-notes").value = "12시까지";
    card.querySelector(".edit-save").click();
    const saved = JSON.parse(localStorage.getItem("task-app.tasks"))[0];
    expect(saved.priority).toBe("high");
    expect(saved.notes).toBe("12시까지");
    expect(li().classList.contains("task--prio-high")).toBe(true);
  });

  it("composer에 우선순위·세부분류 선택이 채워지고 새 항목에 반영된다", async () => {
    localStorage.setItem(
      "task-app.subcategories",
      JSON.stringify({ 개인: [], 업무: ["빅데이터"], 공부: [] })
    );
    await import("../src/main.js");
    expect(
      document.querySelectorAll("#priority-select option")
    ).toHaveLength(3);

    document.querySelector("#category-select").value = "업무";
    document
      .querySelector("#category-select")
      .dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#subcategory-select").value = "빅데이터";
    document.querySelector("#priority-select").value = "high";
    document.querySelector("#task-input").value = "파이프라인 점검";
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    const t0 = JSON.parse(localStorage.getItem("task-app.tasks"))[0];
    expect(t0).toMatchObject({
      text: "파이프라인 점검",
      category: "업무",
      subcategory: "빅데이터",
      priority: "high",
    });
  });

  it("편집 카드에서 다른 날로 옮기고 여러 날로 만들 수 있다", async () => {
    const today = todayISODate();
    const later = addDays(today, 3);
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "a",
          text: "출장",
          category: "업무",
          completed: false,
          createdAt: 1,
          date: today,
        },
      ])
    );
    await import("../src/main.js");

    document.querySelector("#task-list li[data-id='a'] .task-edit").click();
    const card = document.querySelector("#task-list .task--editing");
    card.querySelector(".edit-date").value = later;
    card.querySelector(".edit-enddate").value = addDays(later, 1);
    card.querySelector(".edit-save").click();

    // 오늘 보기에서는 사라지고
    expect(document.querySelector("#task-list li[data-id='a']")).toBeNull();
    const saved = JSON.parse(localStorage.getItem("task-app.tasks"))[0];
    expect(saved.date).toBe(later);
    expect(saved.endDate).toBe(addDays(later, 1));

    // 그 날짜로 이동하면 보이고, 이틀 다 걸친다
    document.querySelector("#period-next").click();
    document.querySelector("#period-next").click();
    document.querySelector("#period-next").click();
    expect(document.querySelector("#task-list li[data-id='a']")).toBeTruthy();
    document.querySelector("#period-next").click();
    expect(document.querySelector("#task-list li[data-id='a']")).toBeTruthy();
    expect(
      document.querySelector("#task-list li[data-id='a'] .task__span")
        .textContent
    ).toBe("2일차");
  });

  it("반복(평일) 추가 → 여러 날 인스턴스 생성, '이후 모두 삭제'", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await import("../src/main.js");

    document.querySelector("#task-input").value = "스탠드업";
    document.querySelector("#recur-select").value = "weekdays";
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    const tasks = JSON.parse(localStorage.getItem("task-app.tasks"));
    expect(tasks.length).toBeGreaterThan(20); // 8주치 평일
    expect(tasks.every((t) => t.recurrence?.freq === "weekdays")).toBe(true);
    const series = tasks[0].series;
    expect(tasks.every((t) => t.series === series)).toBe(true);
    // 오늘 목록엔 하나만 (오늘이 평일이면)
    const todayRows = document.querySelectorAll("#task-list li[data-id]");
    expect(todayRows.length).toBeLessThanOrEqual(1);

    // 첫 표시 항목 삭제 → confirm true = 이후 모두
    if (todayRows.length === 1) {
      todayRows[0].querySelector(".task-delete").click();
      expect(JSON.parse(localStorage.getItem("task-app.tasks")).length).toBe(0);
    }
  });

  it("매주 선택 시 요일 체크박스가 보이고, 선택 요일만 생성", async () => {
    await import("../src/main.js");
    const recur = document.querySelector("#recur-select");
    expect(document.querySelector("#recur-days").hidden).toBe(true);
    recur.value = "weekly";
    recur.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector("#recur-days").hidden).toBe(false);
    expect(document.querySelectorAll("#recur-days .recur-day")).toHaveLength(7);

    // 월요일(1) + 목요일(4)만
    const boxes = document.querySelectorAll("#recur-days .recur-day");
    boxes[1].checked = true;
    boxes[4].checked = true;
    document.querySelector("#task-input").value = "주간 리뷰";
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    const tasks = JSON.parse(localStorage.getItem("task-app.tasks"));
    const dows = new Set(
      tasks.map((t) => new Date(t.date + "T12:00").getDay())
    );
    expect([...dows].sort()).toEqual([1, 4]);
  });

  it("주별 항목을 편집 카드에서 특정 날 일별로 할당", async () => {
    const today = todayISODate();
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "w",
          text: "이번주 계획",
          category: "업무",
          scope: "week",
          completed: false,
          createdAt: 1,
          date: today,
        },
      ])
    );
    await import("../src/main.js");
    document.querySelector("#view-week").click();
    document.querySelector("#task-list li[data-id='w'] .task-edit").click();
    const card = document.querySelector("#task-list .task--editing");
    card.querySelector(".edit-scope").value = "day";
    card.querySelector(".edit-date").value = today;
    card.querySelector(".edit-save").click();

    const saved = JSON.parse(localStorage.getItem("task-app.tasks"))[0];
    expect("scope" in saved).toBe(false);
    expect(saved.date).toBe(today);
  });

  it("히스토리 다이얼로그: 완료 항목이 나타나고 검색으로 걸러진다", async () => {
    const today = todayISODate();
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "a",
          text: "보고서 제출",
          category: "업무",
          completed: true,
          doneAt: Date.now() - 7200e3,
          createdAt: Date.now() - 3 * 86400e3,
          date: today,
        },
        {
          id: "b",
          text: "장보기",
          category: "개인",
          completed: true,
          doneAt: Date.now() - 3600e3,
          createdAt: Date.now() - 3600e3 * 2,
          date: today,
        },
        {
          id: "c",
          text: "안 끝난 일",
          category: "공부",
          completed: false,
          createdAt: 1,
          date: today,
        },
      ])
    );
    await import("../src/main.js");
    const dlg = document.querySelector("#history-dialog");
    dlg.showModal = vi.fn(() => dlg.setAttribute("open", ""));

    document.querySelector("#history-btn").click();
    let items = dlg.querySelectorAll(".history__item");
    expect(items).toHaveLength(2); // 완료 2건만
    expect(dlg.textContent).toContain("보고서 제출");
    expect(dlg.textContent).not.toContain("안 끝난 일");

    const search = document.querySelector("#history-search");
    search.value = "보고서";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    items = dlg.querySelectorAll(".history__item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("보고서 제출");
    expect(items[0].textContent).toMatch(/소요/);
  });

  it("트리에서 세부분류를 고르면 입력창에 반영되어 그대로 추가된다", async () => {
    localStorage.setItem(
      "task-app.subcategories",
      JSON.stringify({ 개인: [], 업무: ["빅데이터", "AI/자동화"], 공부: [] })
    );
    await import("../src/main.js");

    // 세부분류 이름에 "/"가 들어가도 정상 (첫 "/"만 기준으로 분리)
    document
      .querySelector('#category-tree button[data-filter="업무/AI/자동화"]')
      .click();
    expect(document.querySelector("#category-select").value).toBe("업무");
    expect(document.querySelector("#subcategory-select").value).toBe("AI/자동화");

    document
      .querySelector('#category-tree button[data-filter="업무/빅데이터"]')
      .click();
    expect(document.querySelector("#subcategory-select").value).toBe("빅데이터");

    document.querySelector("#task-input").value = "테스트";
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    const t0 = JSON.parse(localStorage.getItem("task-app.tasks"))[0];
    expect(t0).toMatchObject({
      text: "테스트",
      category: "업무",
      subcategory: "빅데이터",
    });
    // 행에서 세부분류 칩이 내용보다 앞에 온다
    const li = document.querySelector(`#task-list li[data-id="${t0.id}"]`);
    const kids = [...li.querySelector(".task__main").children];
    const subIdx = kids.findIndex((k) => k.classList.contains("task__subcat"));
    const textIdx = kids.findIndex((k) => k.classList.contains("task__text"));
    expect(subIdx).toBeGreaterThanOrEqual(0);
    expect(subIdx).toBeLessThan(textIdx);
  });

  it("세부분류 편집 다이얼로그가 열리고 추가·저장된다", async () => {
    await import("../src/main.js");
    const dlg = document.querySelector("#subcat-dialog");
    dlg.showModal = vi.fn(() => dlg.setAttribute("open", ""));
    document.querySelector("#subcat-edit").click();
    expect(dlg.hasAttribute("open")).toBe(true);

    const form = dlg.querySelector("form.kwcat__add");
    form.querySelector("input").value = "새분류";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    const saved = JSON.parse(localStorage.getItem("task-app.subcategories"));
    expect(Object.values(saved).flat()).toContain("새분류");
  });

  it("입력 내용으로 카테고리를 자동 분류한다 (직접 선택하면 존중)", async () => {
    await import("../src/main.js");
    const input = document.querySelector("#task-input");
    const select = document.querySelector("#category-select");
    const hint = document.querySelector("#classify-hint");

    input.value = "거래처 미팅 자료 준비";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(select.value).toBe("업무");
    expect(hint.hidden).toBe(false);

    // 사용자가 직접 바꾸면 그 뒤로는 자동 분류가 개입하지 않는다
    select.value = "개인";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = "거래처 미팅 회의 보고서";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(select.value).toBe("개인");
    expect(hint.hidden).toBe(true);

    // 추가하고 나면 자동 분류가 다시 켜진다
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(JSON.parse(localStorage.getItem("task-app.tasks"))[0].category).toBe(
      "개인"
    );
    input.value = "토익 단어 외우기";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(select.value).toBe("공부");
  });

  it("수동으로 카테고리를 바꾸면 키워드가 학습되어 다음 분류에 반영된다", async () => {
    await import("../src/main.js");
    const input = document.querySelector("#task-input");
    const select = document.querySelector("#category-select");

    // '회식'은 내장 키워드에 없다 → 자동 분류 안 됨
    input.value = "부서 회식 장소 예약";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // 사용자가 업무로 지정 → 내용에서 키워드 1개 학습
    select.value = "업무";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const saved = JSON.parse(localStorage.getItem("task-app.classifier"));
    const learned = saved.learned["업무"];
    expect(learned.length).toBeGreaterThan(0);

    // 학습된 키워드가 들어간 새 입력은 이제 업무로 분류된다
    document
      .querySelector("#task-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    input.value = `송년 ${learned[0]} 예정`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(select.value).toBe("업무");
  });

  it("분류 설정 다이얼로그에서 키워드를 추가하면 분류에 반영된다", async () => {
    await import("../src/main.js");
    const dialog = document.querySelector("#settings-dialog");
    if (!dialog.showModal) dialog.showModal = () => (dialog.open = true);

    document.querySelector("#settings-btn").click();
    const body = document.querySelector("#settings-body");
    expect(body.querySelectorAll(".kwcat").length).toBe(3);

    // 공부 섹션의 추가 폼 찾기 (섹션 순서 = CATEGORIES 순서: 개인, 업무, 공부)
    const studyForm = body.querySelectorAll(".kwcat__add")[2];
    studyForm.querySelector("input").value = "코테";
    studyForm.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );

    const saved = JSON.parse(localStorage.getItem("task-app.classifier"));
    expect(saved.custom["공부"]).toContain("코테");

    const input = document.querySelector("#task-input");
    input.value = "코테 문제 풀기";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector("#category-select").value).toBe("공부");
  });

  it("어제 만든 할 일은 오늘 일별 뷰에 안 보이고, 기간을 옮기면 보인다", async () => {
    const yesterday = addDays(todayISODate(), -1);
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "y",
          text: "어제 할 일",
          category: "개인",
          completed: false,
          createdAt: Date.now(),
          date: yesterday,
        },
      ])
    );
    await import("../src/main.js");

    expect(document.querySelectorAll("#task-list li[data-id]")).toHaveLength(0);

    document.querySelector("#period-prev").click();
    const shown = [...document.querySelectorAll("#task-list li[data-id]")];
    expect(shown.map((li) => li.dataset.id)).toEqual(["y"]);
  });

  it("달력에서 날짜를 클릭하면 그 날짜로 이동한다", async () => {
    const target = addDays(todayISODate(), -3);
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "h",
          text: "사흘 전 할 일",
          category: "개인",
          completed: false,
          createdAt: Date.now(),
          date: target,
        },
      ])
    );
    await import("../src/main.js");

    const sel = `#calendar button[data-date="${target}"]`;
    const cell = document.querySelector(sel);
    expect(cell).toBeTruthy();
    cell.click();

    const shown = [...document.querySelectorAll("#task-list li[data-id]")];
    expect(shown.map((li) => li.dataset.id)).toEqual(["h"]);
    // 달력은 매 렌더마다 새로 그려지므로 다시 조회한다
    expect(
      document.querySelector(sel).classList.contains("is-selected")
    ).toBe(true);
  });

  it("주별 토글은 그 주 전체를 하나의 평면 목록으로 모은다", async () => {
    const today = todayISODate();
    // 이번 주 안에 있으면서 오늘이 아닌 날 (주말 어느 쪽이든 오늘일 수 있으므로 분기)
    const other =
      endOfWeek(today) !== today ? endOfWeek(today) : startOfWeek(today);
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "t1",
          text: "오늘",
          category: "개인",
          completed: false,
          createdAt: 1,
          date: today,
        },
        {
          id: "t2",
          text: "같은 주 다른 날",
          category: "개인",
          completed: false,
          createdAt: 2,
          date: other,
        },
      ])
    );
    await import("../src/main.js");

    // 일별에서는 오늘 것만, 날짜 뱃지 없음
    expect(
      [...document.querySelectorAll("#task-list li[data-id]")].map(
        (li) => li.dataset.id
      )
    ).toEqual(["t1"]);
    expect(document.querySelector("#task-list .task__date")).toBeNull();

    document.querySelector("#view-week").click();
    // 날짜 그룹(아젠다) 없이 평면 목록
    expect(document.querySelector("#task-list .agenda__day")).toBeNull();
    const week = [...document.querySelectorAll("#task-list li[data-id]")].map(
      (li) => li.dataset.id
    );
    expect(week.sort()).toEqual(["t1", "t2"]);
    // 주·월 통합 목록은 행마다 날짜 뱃지가 붙는다
    expect(
      document.querySelectorAll("#task-list li[data-id] .task__date")
    ).toHaveLength(2);
  });

  it("주별 보기의 달력: WK 열만 클릭 가능, 날짜 셀은 이동 안 함", async () => {
    await import("../src/main.js");
    document.querySelector("#view-week").click();

    // 날짜 셀에 data-date 버튼이 없다
    expect(document.querySelector("#calendar button[data-date]")).toBeNull();

    const label0 = document.querySelector("#period-label").textContent;
    const wkBtns = document.querySelectorAll("#calendar button[data-week]");
    expect(wkBtns.length).toBeGreaterThan(1);

    // 첫 주와 다른 주의 WK 버튼을 눌러 기간이 바뀌는지 확인
    const other = [...wkBtns].find(
      (b) => !b.classList.contains("is-selected")
    );
    other.click();
    expect(document.querySelector("#period-label").textContent).not.toBe(
      label0
    );
    // 여전히 주별 보기
    expect(
      document.querySelector("#view-week").getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("월별 보기는 그 달 전체를 하나의 평면 목록으로 보여준다", async () => {
    const today = todayISODate();
    const mid = startOfMonth(today).slice(0, 8) + "15"; // 그 달 15일
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "m1",
          text: "이번 달 할 일",
          category: "개인",
          completed: false,
          createdAt: 1,
          date: mid,
        },
        {
          id: "m2",
          text: "이번 달 다른 할 일",
          category: "업무",
          completed: false,
          createdAt: 2,
          date: startOfMonth(today).slice(0, 8) + "20",
        },
      ])
    );
    await import("../src/main.js");

    document.querySelector("#view-month").click();
    expect(document.querySelector("#period-label").textContent).toMatch(
      /\d{4}년 \d{1,2}월/
    );
    expect(document.querySelector("#task-list .agenda__day")).toBeNull();
    const ids = [...document.querySelectorAll("#task-list li[data-id]")].map(
      (li) => li.dataset.id
    );
    expect(ids.sort()).toEqual(["m1", "m2"]);
  });

  it("날짜순 정렬은 주별 통합 목록을 날짜 오름차순으로 정렬한다", async () => {
    const today = todayISODate();
    const sun = startOfWeek(today);
    const sat = endOfWeek(today);
    localStorage.setItem(
      "task-app.tasks",
      JSON.stringify([
        {
          id: "late",
          text: "토요일",
          category: "개인",
          completed: false,
          createdAt: 1,
          date: sat,
        },
        {
          id: "early",
          text: "일요일",
          category: "개인",
          completed: false,
          createdAt: 2,
          date: sun,
        },
      ])
    );
    await import("../src/main.js");
    document.querySelector("#view-week").click();
    const sort = document.querySelector("#sort-select");
    sort.value = "date-asc";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      [...document.querySelectorAll("#task-list li[data-id]")].map(
        (li) => li.dataset.id
      )
    ).toEqual(["early", "late"]);
  });

  it("주/월 보기에서 composer 대상 안내가 나온다", async () => {
    await import("../src/main.js");
    const target = document.querySelector("#composer-target");
    expect(target.hidden).toBe(true); // 일별
    document.querySelector("#view-week").click();
    expect(target.hidden).toBe(false);
    expect(target.textContent).toContain("계획");
  });

  it("주별/월별 보기에서 추가하면 그 주/달 계획으로 저장된다", async () => {
    await import("../src/main.js");
    const add = (txt) => {
      document.querySelector("#task-input").value = txt;
      document
        .querySelector("#task-form")
        .dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true })
        );
    };

    document.querySelector("#view-week").click();
    add("이번 주에 보고서 초안");
    document.querySelector("#view-month").click();
    add("이번 달에 세금 신고");

    const saved = JSON.parse(localStorage.getItem("task-app.tasks"));
    expect(saved.find((t) => t.text === "이번 주에 보고서 초안").scope).toBe(
      "week"
    );
    expect(saved.find((t) => t.text === "이번 달에 세금 신고").scope).toBe(
      "month"
    );

    // 일별 보기에는 주·월 계획이 안 보인다
    document.querySelector("#view-day").click();
    const dayTexts = [
      ...document.querySelectorAll("#task-list li[data-id] .task__text"),
    ].map((el) => el.textContent);
    expect(dayTexts).not.toContain("이번 주에 보고서 초안");
    expect(dayTexts).not.toContain("이번 달에 세금 신고");

    // 주별 보기: 주 계획은 보이고 월 계획은 안 보인다 (계획이 목록 위로)
    document.querySelector("#view-week").click();
    const weekList = [
      ...document.querySelectorAll("#task-list li[data-id] .task__text"),
    ].map((el) => el.textContent);
    expect(weekList).toContain("이번 주에 보고서 초안");
    expect(weekList).not.toContain("이번 달에 세금 신고");
    expect(
      document.querySelector("#task-list li[data-id] .task__scope").textContent
    ).toMatch(/^WK\d+$/);
  });

  it("메모를 입력하면 localStorage에 저장되고 새로고침 후 복원된다", async () => {
    vi.useFakeTimers();
    await import("../src/main.js");
    const memo = document.querySelector("#memo-input");
    expect(memo.value).toBe("");
    memo.value = "회의 자료 정리";
    memo.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(localStorage.getItem("task-app.memo")).toBe("회의 자료 정리");
    vi.useRealTimers();

    // 다시 로드 → 값 복원
    vi.resetModules();
    document.body.innerHTML = bodyInner;
    await import("../src/main.js");
    expect(document.querySelector("#memo-input").value).toBe("회의 자료 정리");
  });

  it("앱 제목·탭에 이름과 버전이 표시된다", async () => {
    await import("../src/main.js");
    const h1 = document.querySelector(".app-bar__title").textContent;
    expect(h1).toContain("AK Task Management");
    expect(h1).toMatch(/v\d+\.\d+\.\d+/);
    expect(document.querySelector(".app-bar__ver")).toBeTruthy();
    expect(document.title).toMatch(/^AK Task Management v\d+\.\d+\.\d+$/);
  });

  it("테마 토글이 data-theme 을 순환시킨다", async () => {
    await import("../src/main.js");
    const btn = document.querySelector("#theme-toggle");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    btn.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    btn.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    btn.click();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
