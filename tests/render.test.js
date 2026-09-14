// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  renderList,
  renderProgress,
  renderCategoryTree,
  renderActiveFilter,
  renderNotice,
  renderCalendar,
  renderPeriodBar,
} from "../src/render.js";

const t = (over = {}) => ({
  id: over.id ?? "id",
  text: over.text ?? "할 일",
  category: over.category ?? "개인",
  completed: over.completed ?? false,
  createdAt: over.createdAt ?? 1,
  date: over.date ?? "2026-09-07",
  ...over,
});

describe("renderList", () => {
  let list;
  beforeEach(() => {
    list = document.createElement("ul");
  });

  it("빈 목록(기간)일 때 안내 문구", () => {
    renderList(list, [], {
      editingId: null,
      manualSort: true,
      emptyKind: "period",
    });
    expect(list.querySelector(".task-list__empty").textContent).toContain(
      "선택한 기간에 할 일이 없습니다"
    );
  });

  it("항목을 li로 그리고 사용자 텍스트는 textContent로 넣는다(XSS 방지)", () => {
    renderList(list, [t({ id: "a", text: "<img src=x onerror=alert(1)>" })], {
      editingId: null,
      manualSort: true,
      emptyKind: "filtered",
    });
    const li = list.querySelector("li[data-id='a']");
    expect(li).toBeTruthy();
    expect(li.querySelector("img")).toBeNull();
    expect(li.querySelector(".task__text").textContent).toBe(
      "<img src=x onerror=alert(1)>"
    );
  });

  it("editingId면 편집 카드(카테고리·세부분류·우선순위·메모)를 그린다", () => {
    renderList(list, [t({ id: "a", category: "업무", subcategory: "빅데이터" })], {
      editingId: "a",
      manualSort: true,
      subcats: { 개인: [], 업무: ["빅데이터", "UT과제"], 공부: [] },
      emptyKind: "filtered",
    });
    const card = list.querySelector(".task--editing");
    expect(card.querySelector(".edit-input")).toBeTruthy();
    expect(card.querySelector(".edit-category").value).toBe("업무");
    expect(card.querySelector(".edit-subcategory").value).toBe("빅데이터");
    expect(card.querySelector(".edit-priority")).toBeTruthy();
    expect(card.querySelector(".edit-notes")).toBeTruthy();
    expect(card.querySelector(".edit-date").value).toBe("2026-09-07");
    expect(card.querySelector(".edit-scope")).toBeTruthy();
    expect(card.querySelector(".edit-enddate")).toBeTruthy();
  });

  it("편집 카드: 여러 날·주별 값 반영", () => {
    renderList(
      list,
      [t({ id: "a", date: "2026-09-08", endDate: "2026-09-10", scope: "week" })],
      { editingId: "a", manualSort: true, emptyKind: "filtered" }
    );
    const card = list.querySelector(".task--editing");
    expect(card.querySelector(".edit-enddate").value).toBe("2026-09-10");
    expect(card.querySelector(".edit-scope").value).toBe("week");
  });

  it("여러 날 항목: 주·월 보기는 범위 뱃지, 일별 보기는 'N일차'", () => {
    const task = t({ id: "s", date: "2026-09-08", endDate: "2026-09-10" });
    renderList(list, [task], {
      editingId: null,
      manualSort: true,
      showDate: true,
      todayISO: "2026-09-01",
      emptyKind: "filtered",
    });
    expect(list.querySelector("li[data-id='s'] .task__date").textContent).toBe(
      "9/8–9/10"
    );

    list.replaceChildren();
    renderList(list, [task], {
      editingId: null,
      manualSort: true,
      showDate: false,
      viewISO: "2026-09-09",
      todayISO: "2026-09-01",
      emptyKind: "filtered",
    });
    expect(list.querySelector("li[data-id='s'] .task__span").textContent).toBe(
      "2일차"
    );
  });

  it("작업중/우선순위/메모 상태가 클래스·요소로 나타난다", () => {
    renderList(
      list,
      [
        t({ id: "d", status: "doing" }),
        t({ id: "h", priority: "high" }),
        t({ id: "l", priority: "low" }),
        t({ id: "n", notes: "상세 내용" }),
      ],
      { editingId: null, manualSort: true, emptyKind: "filtered" }
    );
    expect(list.querySelector("li[data-id='d']").classList.contains("task--doing")).toBe(true);
    expect(
      list.querySelector("li[data-id='d'] .task-doing").getAttribute("aria-pressed")
    ).toBe("true");
    expect(list.querySelector("li[data-id='h']").classList.contains("task--prio-high")).toBe(true);
    expect(list.querySelector("li[data-id='h'] .task__prio--high")).toBeTruthy();
    expect(list.querySelector("li[data-id='l']").classList.contains("task--prio-low")).toBe(true);
    // 메모 있는 항목은 표시 목록에서도 textarea 노출
    expect(list.querySelector("li[data-id='n'] .task__notes").value).toBe("상세 내용");
    expect(list.querySelector("li[data-id='n'] .task__notes-toggle").classList.contains("has-notes")).toBe(true);
  });

  it("완료 항목은 진행중 토글이 비활성", () => {
    renderList(list, [t({ id: "a", completed: true })], {
      editingId: null,
      manualSort: true,
      emptyKind: "filtered",
    });
    expect(list.querySelector(".task-doing").disabled).toBe(true);
  });

  it("expandedNotes에 있으면 메모 없어도 textarea를 연다", () => {
    renderList(list, [t({ id: "a" })], {
      editingId: null,
      manualSort: true,
      expandedNotes: new Set(["a"]),
      emptyKind: "filtered",
    });
    expect(list.querySelector(".task__notes")).toBeTruthy();
  });

  it("manualSort=false면 드래그 핸들이 비활성", () => {
    renderList(list, [t({ id: "a" })], {
      editingId: null,
      manualSort: false,
      emptyKind: "filtered",
    });
    expect(list.querySelector(".task__drag").disabled).toBe(true);
    expect(list.querySelector("li[data-id='a']").draggable).toBe(false);
  });

  it("showDate면 각 행에 날짜 뱃지를 넣는다 (오늘은 강조)", () => {
    renderList(
      list,
      [
        t({ id: "a", date: "2026-09-07" }),
        t({ id: "b", date: "2026-09-09" }),
      ],
      {
        editingId: null,
        manualSort: true,
        showDate: true,
        todayISO: "2026-09-07",
        emptyKind: "filtered",
      }
    );
    const a = list.querySelector("li[data-id='a'] .task__date");
    const b = list.querySelector("li[data-id='b'] .task__date");
    expect(a.textContent).toBe("오늘");
    expect(a.classList.contains("task__date--today")).toBe(true);
    expect(b.textContent).toBe("9/9 (수)");
  });

  it("showDate가 없으면 날짜 뱃지가 없다", () => {
    renderList(list, [t({ id: "a" })], {
      editingId: null,
      manualSort: true,
      emptyKind: "filtered",
    });
    expect(list.querySelector(".task__date")).toBeNull();
  });

  it("주/월 계획은 날짜 대신 WK/월 뱃지를 단다", () => {
    renderList(
      list,
      [
        t({ id: "w", date: "2026-09-09", scope: "week" }),
        t({ id: "m", date: "2026-09-09", scope: "month" }),
      ],
      {
        editingId: null,
        manualSort: true,
        showDate: true,
        todayISO: "2026-09-07",
        emptyKind: "filtered",
      }
    );
    expect(list.querySelector("li[data-id='w'] .task__scope").textContent).toBe(
      "WK37"
    );
    expect(list.querySelector("li[data-id='w'] .task__date")).toBeNull();
    expect(list.querySelector("li[data-id='m'] .task__scope").textContent).toBe(
      "9월"
    );
  });
});

describe("renderProgress", () => {
  const makeEls = () => ({
    text: document.createElement("span"),
    percent: document.createElement("span"),
    fill: document.createElement("div"),
  });

  it("빈 목록", () => {
    const els = makeEls();
    renderProgress(els, []);
    expect(els.text.textContent).toBe("할 일이 없습니다");
    expect(els.fill.style.width).toBe("0%");
  });

  it("일부 완료", () => {
    const els = makeEls();
    renderProgress(els, [t({ completed: true }), t({ completed: false })]);
    expect(els.percent.textContent).toBe("50%");
    expect(els.fill.style.width).toBe("50%");
  });

  it("전부 완료면 축하 문구", () => {
    const els = makeEls();
    renderProgress(els, [t({ completed: true })]);
    expect(els.text.textContent).toContain("🎉");
  });
});

describe("renderCalendar", () => {
  let box;
  beforeEach(() => {
    box = document.createElement("div");
  });

  it("요일 헤더 7개 + WK열(헤더+6주) + 날짜 버튼 42개", () => {
    renderCalendar(box, {
      year: 2026,
      month: 8, // 9월 (0-idx)
      selectedISO: "2026-09-07",
      todayISO: "2026-09-07",
      counts: {},
    });
    expect(box.querySelectorAll(".calendar__wd")).toHaveLength(7);
    expect(box.querySelectorAll(".cal-wk")).toHaveLength(7); // "WK" 헤더 + 6주
    expect(box.querySelectorAll(".cal-wk--head")).toHaveLength(1);
    expect(box.querySelectorAll("button[data-date]")).toHaveLength(42);
    // 첫 주 행의 WK 번호 (2026-08-30 일요일이 속한 주)
    const wknums = [...box.querySelectorAll(".calendar__days .cal-wk")].map(
      (el) => el.textContent
    );
    expect(wknums).toHaveLength(6);
    expect(Number(wknums[0])).toBeGreaterThan(0);
  });

  it("selectionMode='week'면 선택 주 7일에 in-week", () => {
    renderCalendar(box, {
      year: 2026,
      month: 8,
      selectedISO: "2026-09-09",
      todayISO: "2026-09-07",
      selectionMode: "week",
      counts: {},
    });
    expect(box.querySelectorAll(".cal-cell.in-week")).toHaveLength(7);
  });

  it("selectionMode='week'면 날짜는 못 누르고 WK 열만 버튼", () => {
    renderCalendar(box, {
      year: 2026,
      month: 8,
      selectedISO: "2026-09-09",
      todayISO: "2026-09-07",
      selectionMode: "week",
      counts: {},
    });
    expect(box.querySelectorAll("button[data-date]")).toHaveLength(0);
    const wkBtns = box.querySelectorAll("button.cal-wk--btn[data-week]");
    expect(wkBtns).toHaveLength(6);
    // 선택 주(9/9이 속한 주)의 WK 버튼에 is-selected
    const selected = [...wkBtns].filter((b) =>
      b.classList.contains("is-selected")
    );
    expect(selected).toHaveLength(1);
  });

  it("selectionMode='month'면 그 달 날짜에 in-month", () => {
    renderCalendar(box, {
      year: 2026,
      month: 8, // 9월 = 30일
      selectedISO: "2026-09-10",
      todayISO: "2026-09-07",
      selectionMode: "month",
      counts: {},
    });
    expect(box.querySelectorAll(".cal-cell.in-month")).toHaveLength(30);
    // 날짜는 여전히 클릭 가능
    expect(box.querySelectorAll("button[data-date]")).toHaveLength(42);
  });

  it("오늘/선택/할 일 있는 날에 클래스가 붙는다", () => {
    renderCalendar(box, {
      year: 2026,
      month: 8,
      selectedISO: "2026-09-10",
      todayISO: "2026-09-07",
      counts: {
        "2026-09-08": { total: 2, done: 1 },
        "2026-09-09": { total: 1, done: 1 },
      },
    });
    const cell = (iso) => box.querySelector(`button[data-date="${iso}"]`);
    expect(cell("2026-09-07").classList.contains("is-today")).toBe(true);
    expect(cell("2026-09-10").classList.contains("is-selected")).toBe(true);
    expect(cell("2026-09-08").classList.contains("has-tasks")).toBe(true);
    expect(cell("2026-09-08").classList.contains("all-done")).toBe(false);
    expect(cell("2026-09-09").classList.contains("all-done")).toBe(true);
    // 8월/10월 날짜는 is-outside
    expect(cell("2026-08-31").classList.contains("is-outside")).toBe(true);
  });
});

describe("renderPeriodBar", () => {
  const makeEls = () => ({
    periodLabel: document.createElement("span"),
    viewDay: document.createElement("button"),
    viewWeek: document.createElement("button"),
    viewMonth: document.createElement("button"),
  });

  it("일별: 오늘이면 '오늘 · ' 접두, day 버튼 활성", () => {
    const els = makeEls();
    renderPeriodBar(els, {
      view: "day",
      anchorISO: "2026-09-07",
      todayISO: "2026-09-07",
    });
    expect(els.periodLabel.textContent).toContain("오늘");
    expect(els.viewDay.classList.contains("is-active")).toBe(true);
    expect(els.viewWeek.getAttribute("aria-pressed")).toBe("false");
    expect(els.viewMonth.getAttribute("aria-pressed")).toBe("false");
  });

  it("주별: 'WK' + 주 범위 라벨, week 버튼 활성", () => {
    const els = makeEls();
    renderPeriodBar(els, {
      view: "week",
      anchorISO: "2026-09-09",
      todayISO: "2026-09-07",
    });
    expect(els.periodLabel.textContent).toMatch(/^WK\d+ · .+–.+/);
    expect(els.viewWeek.classList.contains("is-active")).toBe(true);
  });

  it("월별: '2026년 9월', month 버튼 활성", () => {
    const els = makeEls();
    renderPeriodBar(els, {
      view: "month",
      anchorISO: "2026-09-20",
      todayISO: "2026-09-07",
    });
    expect(els.periodLabel.textContent).toBe("2026년 9월");
    expect(els.viewMonth.classList.contains("is-active")).toBe(true);
  });
});

describe("renderCategoryTree", () => {
  const subcats = { 개인: [], 업무: ["빅데이터", "UT과제"], 공부: [] };
  const counts = {
    전체: 5,
    개인: { 전체: 1, 미분류: 1 },
    업무: { 전체: 4, 미분류: 1, 빅데이터: 2, UT과제: 1 },
    공부: { 전체: 0, 미분류: 0 },
  };

  it("전체 + 카테고리 3 + 세부분류 + 미분류 행, 개수 표기", () => {
    const box = document.createElement("div");
    renderCategoryTree(box, { subcats, counts, activeFilter: "전체" });
    const rows = [...box.querySelectorAll("button[data-filter]")];
    const filters = rows.map((r) => r.dataset.filter);
    expect(filters).toContain("전체");
    expect(filters).toContain("업무");
    expect(filters).toContain("업무/빅데이터");
    expect(filters).toContain("업무/"); // 미분류 (개수 1)
    expect(filters).toContain("개인/"); // 미분류 1개 있으면 표시
    expect(filters).not.toContain("공부/"); // 미분류 0 → 행 없음
    const big = rows.find((r) => r.dataset.filter === "업무/빅데이터");
    expect(big.querySelector(".cat-tree__count").textContent).toBe("2");
  });

  it("activeFilter 행에 is-active", () => {
    const box = document.createElement("div");
    renderCategoryTree(box, { subcats, counts, activeFilter: "업무/빅데이터" });
    const active = box.querySelector(".is-active");
    expect(active.dataset.filter).toBe("업무/빅데이터");
  });
});

describe("renderActiveFilter / renderNotice", () => {
  it("전체면 숨기고, 세부분류면 '카테고리 › 세부분류' 표시", () => {
    const el = document.createElement("button");
    renderActiveFilter(el, "전체");
    expect(el.hidden).toBe(true);
    renderActiveFilter(el, "업무/빅데이터");
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("업무");
    expect(el.textContent).toContain("빅데이터");
    renderActiveFilter(el, "업무/");
    expect(el.textContent).toContain("미분류");
  });

  it("숨김 수가 0이면 notice를 감춘다", () => {
    const p = document.createElement("p");
    renderNotice(p, 0);
    expect(p.hidden).toBe(true);
    renderNotice(p, 3);
    expect(p.hidden).toBe(false);
    expect(p.textContent).toContain("3");
  });
});
