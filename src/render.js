"use strict";

import {
  CATEGORIES,
  SORT_MODES,
  SORT_LABELS,
  PRIORITIES,
  SCOPES,
  progress,
  taskStatus,
  taskPriority,
  taskScope,
  taskEndDate,
  recurrenceLabel,
} from "./tasks.js";
import {
  WEEKDAY_NAMES,
  monthMatrix,
  parseISO,
  weekDates,
  weekOfYear,
  formatDayLabel,
  formatWeekLabel,
  formatMonthTitle,
  formatShortDay,
  formatDaySpan,
  daySpanIndex,
  daySpanLength,
} from "./dates.js";

/* ──────────────────────────────────────────────────────────────
 * DOM 생성. 모든 텍스트는 textContent로만 넣는다(할 일 내용은 사용자 입력).
 * 이 모듈은 전역 상태를 읽지 않는다 — 필요한 값은 인자로 받는다.
 * ────────────────────────────────────────────────────────────── */

/** <option> 묶음을 select에 채운다. */
function fillCategoryOptions(select, selected) {
  for (const name of CATEGORIES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === selected) option.selected = true;
    select.append(option);
  }
}

/** 세부분류 <select>를 그 카테고리 목록으로 채운다("(없음)" 포함). 업무는 "부모/자식" 형식. */
export function fillSubcatOptions(select, cat, subcats, selected) {
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "(세부분류 없음)";
  select.append(none);

  if (cat === "업무") {
    const map = subcats?.업무 ?? {};
    for (const [parent, children] of Object.entries(map)) {
      if (!Array.isArray(children) || children.length === 0) {
        const option = document.createElement("option");
        option.value = parent;
        option.textContent = parent;
        select.append(option);
      } else {
        for (const child of children) {
          const option = document.createElement("option");
          option.value = `${parent}/${child}`;
          option.textContent = `${parent} › ${child}`;
          select.append(option);
        }
      }
    }
    select.value = selected && Array.from(select.options).some(o => o.value === selected) ? selected : "";
  } else {
    const list = subcats?.[cat] ?? [];
    for (const name of list) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    }
    select.value = selected && list.includes(selected) ? selected : "";
  }
}

const PRIO_LABELS = { high: "높음", normal: "보통", low: "낮음" };
const PRIO_MARK = { high: "▲", low: "▼" };

/** 우선순위 <select>를 채운다. */
export function fillPriorityOptions(select, selected) {
  select.replaceChildren();
  for (const p of PRIORITIES) {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = `우선순위: ${PRIO_LABELS[p]}`;
    if (p === selected) o.selected = true;
    select.append(o);
  }
}

/** 정렬 <select>의 옵션을 채운다. */
export function buildSortOptions(select, selected) {
  for (const mode of SORT_MODES) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = SORT_LABELS[mode];
    if (mode === selected) option.selected = true;
    select.append(option);
  }
}

function iconButton(cls, label, aria) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  if (aria) b.setAttribute("aria-label", aria);
  return b;
}

/** 표시 모드 <li>. */
function renderDisplayItem(task, opts) {
  const { manualSort, showDate, todayISO, viewISO, expandedNotes } = opts;
  const status = taskStatus(task);
  const prio = taskPriority(task);

  const li = document.createElement("li");
  li.className = "task";
  if (task.completed) li.classList.add("task--done");
  if (status === "doing") li.classList.add("task--doing");
  if (prio !== "normal") li.classList.add(`task--prio-${prio}`);
  li.dataset.id = task.id;
  if (manualSort) li.draggable = true;

  const main = document.createElement("div");
  main.className = "task__main";

  const handle = iconButton(
    "task__drag",
    "⠿",
    manualSort
      ? "드래그 또는 방향키로 순서 변경"
      : "순서 변경은 정렬을 '수동'으로 바꾸세요"
  );
  handle.disabled = !manualSort;

  const checkLabel = document.createElement("label");
  checkLabel.className = "task__check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = task.completed;
  const checkHidden = document.createElement("span");
  checkHidden.className = "visually-hidden";
  checkHidden.textContent = `"${task.text}" 완료`;
  checkLabel.append(checkbox, checkHidden);

  const doing = iconButton(
    "task-doing",
    "진행",
    status === "doing" ? `"${task.text}" 작업중 해제` : `"${task.text}" 작업중`
  );
  doing.setAttribute("aria-pressed", String(status === "doing"));
  doing.disabled = task.completed;

  const text = document.createElement("span");
  text.className = "task__text";
  text.textContent = task.text;
  text.title = "더블클릭하여 수정";

  const hasNotes = typeof task.notes === "string" && task.notes.trim() !== "";
  const notesToggle = iconButton(
    "task__notes-toggle",
    hasNotes ? "메모•" : "메모",
    hasNotes ? `"${task.text}" 메모 보기/편집` : `"${task.text}" 메모 추가`
  );
  if (hasNotes) notesToggle.classList.add("has-notes");

  main.append(handle, checkLabel, doing);
  if (prio !== "normal") {
    const mark = document.createElement("span");
    mark.className = `task__prio task__prio--${prio}`;
    mark.textContent = PRIO_MARK[prio];
    mark.title = `우선순위 ${PRIO_LABELS[prio]}`;
    main.append(mark);
  }

  // 세부분류는 내용 앞에 태그로 붙인다 → "[빅데이터] 테스트"
  if (task.subcategory) {
    const sc = document.createElement("span");
    sc.className = "task__subcat";
    sc.textContent = task.subcategory;
    main.append(sc);
  }

  main.append(text, notesToggle);

  if (task.recurrence) {
    const rec = document.createElement("span");
    rec.className = "task__recur";
    rec.textContent = "🔁";
    rec.title = `반복: ${recurrenceLabel(task.recurrence)}`;
    rec.setAttribute("aria-label", rec.title);
    main.append(rec);
  }

  const scope = taskScope(task);
  const end = taskEndDate(task);
  const multiDay = scope === "day" && end > task.date;

  if (showDate) {
    const badge = document.createElement("span");
    if (scope === "day") {
      badge.className = "task__date";
      badge.textContent = multiDay
        ? formatDaySpan(task.date, end, todayISO)
        : formatShortDay(task.date, todayISO);
      if (!multiDay && task.date === todayISO) {
        badge.classList.add("task__date--today");
      }
    } else {
      badge.className = `task__scope task__scope--${scope}`;
      badge.textContent =
        scope === "week"
          ? `WK${weekOfYear(task.date)}`
          : `${parseISO(task.date).getMonth() + 1}월`;
      badge.title = scope === "week" ? "이번 주 계획" : "이번 달 계획";
    }
    main.append(badge);
  } else if (multiDay && viewISO) {
    // 일별 보기: 이 항목이 며칠째인지
    const idx = daySpanIndex(task.date, viewISO);
    const len = daySpanLength(task.date, end);
    const span = document.createElement("span");
    span.className = "task__span";
    span.textContent = `${idx}일차`;
    span.title = `${formatDaySpan(task.date, end, todayISO)} (${len}일)`;
    main.append(span);
  }

  const category = document.createElement("span");
  category.className = "task__cat";
  category.dataset.category = task.category;
  category.textContent = task.category;

  main.append(
    category,
    iconButton("task-edit icon-btn", "수정", `"${task.text}" 수정`),
    iconButton("task-delete icon-btn", "삭제", `"${task.text}" 삭제`)
  );
  li.append(main);

  if (hasNotes || expandedNotes?.has(task.id)) {
    const notes = document.createElement("textarea");
    notes.className = "task__notes";
    notes.value = task.notes ?? "";
    notes.rows = 2;
    notes.placeholder = "상세 내용…";
    notes.setAttribute("aria-label", `"${task.text}" 상세 메모`);
    li.append(notes);
  }
  return li;
}

/** 편집 카드 <li>. */
function renderEditItem(task, { subcats }) {
  const li = document.createElement("li");
  li.className = "task task--editing";
  li.dataset.id = task.id;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-input";
  input.value = task.text;
  input.setAttribute("aria-label", "할 일 내용");

  const cat = document.createElement("select");
  cat.className = "edit-category";
  cat.setAttribute("aria-label", "카테고리");
  fillCategoryOptions(cat, task.category);

  const sub = document.createElement("select");
  sub.className = "edit-subcategory";
  sub.setAttribute("aria-label", "세부분류");
  fillSubcatOptions(sub, task.category, subcats, task.subcategory);

  const prio = document.createElement("select");
  prio.className = "edit-priority";
  prio.setAttribute("aria-label", "우선순위");
  fillPriorityOptions(prio, taskPriority(task));

  const SCOPE_LABEL = { day: "일별(특정 날)", week: "주별 계획", month: "월별 계획" };
  const scopeSel = document.createElement("select");
  scopeSel.className = "edit-scope";
  scopeSel.setAttribute("aria-label", "기간 단위");
  for (const s of SCOPES) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = SCOPE_LABEL[s];
    if (s === taskScope(task)) o.selected = true;
    scopeSel.append(o);
  }

  const dateIn = document.createElement("input");
  dateIn.type = "date";
  dateIn.className = "edit-date";
  dateIn.value = task.date;
  dateIn.setAttribute("aria-label", "날짜");

  const endIn = document.createElement("input");
  endIn.type = "date";
  endIn.className = "edit-enddate";
  endIn.value = taskEndDate(task) > task.date ? taskEndDate(task) : "";
  endIn.min = task.date;
  endIn.setAttribute("aria-label", "종료일 (여러 날, 선택)");
  endIn.title = "여러 날에 걸치는 일이면 종료일을 지정하세요";

  const notes = document.createElement("textarea");
  notes.className = "edit-notes";
  notes.rows = 2;
  notes.value = task.notes ?? "";
  notes.placeholder = "상세 내용 (선택)";
  notes.setAttribute("aria-label", "상세 메모");

  const saveBtn = iconButton("edit-save", "저장");
  const cancelBtn = iconButton("edit-cancel", "취소");

  const row1 = document.createElement("div");
  row1.className = "edit-grid__row";
  row1.append(input);

  const row2 = document.createElement("div");
  row2.className = "edit-grid__row";
  row2.append(cat, sub, prio);

  const row3 = document.createElement("div");
  row3.className = "edit-grid__row";
  const dateWrap = document.createElement("span");
  dateWrap.className = "edit-daterange";
  const tilde = document.createElement("span");
  tilde.className = "edit-daterange__sep";
  tilde.textContent = "~";
  dateWrap.append(scopeSel, dateIn, tilde, endIn);
  row3.append(dateWrap, saveBtn, cancelBtn);

  li.append(row1, row2, row3, notes);
  return li;
}

/** task 하나를 편집 여부에 따라 <li>로. */
function renderItem(task, opts) {
  return task.id === opts.editingId
    ? renderEditItem(task, opts)
    : renderDisplayItem(task, opts);
}

/** 편집 중인 입력창에 포커스를 준다(있으면). */
function focusEditInput(rootEl) {
  const input = rootEl.querySelector(".task--editing .edit-input");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

const EMPTY_MSG = {
  period: "선택한 기간에 할 일이 없습니다. 위에서 추가해 보세요.",
  filtered: "조건에 맞는 할 일이 없습니다.",
};

/** 빈 목록 안내 <li>. */
function emptyItem(kind) {
  const li = document.createElement("li");
  li.className = "task-list__empty";
  li.textContent = EMPTY_MSG[kind] ?? EMPTY_MSG.filtered;
  return li;
}

/**
 * 목록을 다시 그린다. 일별은 그 날, 주·월별은 기간 전체를 하나의 평면
 * 목록으로 보여준다(주·월별은 각 행에 날짜 뱃지 — opts.showDate).
 * @param {HTMLElement} listEl
 * @param {Array} tasksToShow  이미 정렬·필터된 목록
 * @param {{
 *   editingId: string|null, manualSort: boolean,
 *   showDate?: boolean, todayISO?: string,
 *   emptyKind: "period"|"filtered",
 * }} opts
 */
export function renderList(listEl, tasksToShow, opts) {
  listEl.replaceChildren();

  if (tasksToShow.length === 0) {
    listEl.append(emptyItem(opts.emptyKind));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const task of tasksToShow) frag.append(renderItem(task, opts));
  listEl.append(frag);
  focusEditInput(listEl);
}

/** 진행률 영역을 갱신한다. 항상 전체 tasks 기준. */
export function renderProgress(els, allTasks) {
  const { total, done, percent } = progress(allTasks);
  els.fill.style.width = `${percent}%`;
  els.percent.textContent = total === 0 ? "" : `${percent}%`;

  if (total === 0) {
    els.text.textContent = "할 일이 없습니다";
  } else if (done === total) {
    els.text.textContent = `${done} / ${total} 완료 · 모두 끝냈어요 🎉`;
  } else {
    els.text.textContent = `${done} / ${total} 완료`;
  }
}

/** 트리 행 하나(카테고리 or 세부분류). */
function treeRow({ label, filter, count, active, level, muted, hasChildren = false, isExpanded = false, onToggle = null }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cat-tree__row";
  btn.dataset.filter = filter;
  btn.dataset.level = String(level);
  if (active) btn.classList.add("is-active");
  if (muted) btn.classList.add("cat-tree__row--muted");
  btn.setAttribute("aria-pressed", String(!!active));

  // 확장/축소 버튼 (엑셀 피봇 스타일)
  if (hasChildren) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cat-tree__toggle";
    toggle.textContent = isExpanded ? "−" : "+";
    toggle.setAttribute("aria-expanded", String(isExpanded));
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onToggle) onToggle();
    });
    btn.append(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "cat-tree__spacer";
    btn.append(spacer);
  }

  const name = document.createElement("span");
  name.className = "cat-tree__name";
  name.textContent = label;
  btn.append(name);

  const n = document.createElement("span");
  n.className = "cat-tree__count";
  n.textContent = String(count ?? 0);
  btn.append(n);
  return btn;
}

/**
 * 좌측 분류 트리. 전체 + 카테고리별(자식: 세부분류 + 미분류).
 * 업무는 "부모 › 자식" 형식으로 표시.
 * @param {{subcats: Record<string,string[]>, counts: object, activeFilter: string}} opts
 *   counts = countBySubcat 결과 { 전체, [cat]: { 전체, 미분류, [sub]: n } }
 */
export function renderCategoryTree(containerEl, { subcats, counts, activeFilter, expandedNodes = new Set(), onToggle = null }) {
  containerEl.replaceChildren();
  const active = activeFilter || "전체";

  containerEl.append(
    treeRow({
      label: "전체",
      filter: "전체",
      count: counts.전체,
      active: active === "전체",
      level: 0,
    })
  );

  for (let catIdx = 0; catIdx < CATEGORIES.length; catIdx++) {
    const cat = CATEGORIES[catIdx];
    const cc = counts[cat] || { 전체: 0, 미분류: 0 };
    const catKey = `cat_${cat}`;
    const isCatExpanded = expandedNodes.has(catKey);

    containerEl.append(
      treeRow({
        label: cat,
        filter: cat,
        count: cc.전체,
        active: active === cat,
        level: 1,
        hasChildren: true,
        isExpanded: isCatExpanded,
        onToggle: () => onToggle?.(catKey),
      })
    );

    if (!isCatExpanded) continue;

    if (cat === "업무") {
      const map = subcats?.업무 ?? {};
      const parents = Object.entries(map);
      for (let pIdx = 0; pIdx < parents.length; pIdx++) {
        const [parent, children] = parents[pIdx];
        const parentKey = `parent_${cat}_${parent}`;
        const isParentExpanded = expandedNodes.has(parentKey);
        const hasChildren = Array.isArray(children) && children.length > 0;

        // 부모 항목 (level 2)
        containerEl.append(
          treeRow({
            label: parent,
            filter: `${cat}/${parent}`,
            count: cc[parent] ?? 0,
            active: active === `${cat}/${parent}`,
            level: 2,
            hasChildren,
            isExpanded: isParentExpanded,
            onToggle: hasChildren ? () => onToggle?.(parentKey) : null,
          })
        );

        // 자식 항목들 (level 3)
        if (hasChildren && isParentExpanded) {
          for (let cIdx = 0; cIdx < children.length; cIdx++) {
            const child = children[cIdx];
            const subKey = `${parent}/${child}`;
            containerEl.append(
              treeRow({
                label: child,
                filter: `${cat}/${subKey}`,
                count: cc[subKey] ?? 0,
                active: active === `${cat}/${subKey}`,
                level: 3,
              })
            );
          }
        }
      }
    } else {
      const subs = subcats?.[cat] ?? [];
      for (let sIdx = 0; sIdx < subs.length; sIdx++) {
        const sub = subs[sIdx];
        containerEl.append(
          treeRow({
            label: sub,
            filter: `${cat}/${sub}`,
            count: cc[sub] ?? 0,
            active: active === `${cat}/${sub}`,
            level: 2,
          })
        );
      }
    }

    if (cc.미분류 > 0) {
      containerEl.append(
        treeRow({
          label: "미분류",
          filter: `${cat}/`,
          count: cc.미분류,
          active: active === `${cat}/`,
          level: 2,
          muted: true,
        })
      );
    }
  }
}

/** 활성 필터 표시("업무 › 빅데이터  ✕"). "전체"면 숨긴다. */
export function renderActiveFilter(el, filter) {
  if (!filter || filter === "전체") {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  const i = filter.indexOf("/");
  const label =
    i === -1
      ? filter
      : filter.slice(i + 1)
        ? `${filter.slice(0, i)} › ${filter.slice(i + 1)}`
        : `${filter.slice(0, i)} › 미분류`;
  el.hidden = false;
  el.replaceChildren();
  const text = document.createElement("span");
  text.textContent = label;
  const x = document.createElement("span");
  x.className = "active-filter__x";
  x.textContent = "✕";
  x.setAttribute("aria-hidden", "true");
  el.append(text, x);
  el.setAttribute("aria-label", `${label} 필터 해제`);
}

/** 필터/숨김으로 가려진 항목 수를 안내한다. */
export function renderNotice(noticeEl, hiddenCount) {
  if (hiddenCount <= 0) {
    noticeEl.hidden = true;
    noticeEl.textContent = "";
    return;
  }
  noticeEl.hidden = false;
  noticeEl.textContent = `현재 조건에서 ${hiddenCount}개의 할 일이 숨겨져 있습니다`;
}

/** 현재 보기의 기간 라벨. */
function periodLabelText(view, anchorISO, todayISO) {
  if (view === "week") {
    return `WK${weekOfYear(anchorISO)} · ${formatWeekLabel(anchorISO)}`;
  }
  if (view === "month") {
    const d = parseISO(anchorISO);
    return formatMonthTitle(d.getFullYear(), d.getMonth());
  }
  return formatDayLabel(anchorISO, todayISO);
}

/**
 * 기간 바: 현재 보고 있는 일/주/월 라벨 + 보기 토글 활성 상태.
 * @param {{periodLabel, viewDay, viewWeek, viewMonth: HTMLElement}} els
 * @param {{view: "day"|"week"|"month", anchorISO: string, todayISO: string}} opts
 */
export function renderPeriodBar(els, { view, anchorISO, todayISO }) {
  els.periodLabel.textContent = periodLabelText(view, anchorISO, todayISO);

  for (const [btn, mode] of [
    [els.viewDay, "day"],
    [els.viewWeek, "week"],
    [els.viewMonth, "month"],
  ]) {
    const on = mode === view;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  }
}

/**
 * 월별 달력 그리드를 그린다. 일요일 시작, 6주, 좌측에 WK(주차) 열.
 * @param {HTMLElement} containerEl
 * @param {{
 *   year: number, month: number,           // month는 0-indexed
 *   selectedISO: string, todayISO: string,
 *   selectionMode: "day"|"week"|"month",    // week면 선택 주 전체를 강조
 *   counts: Record<string, {total:number, done:number}>,
 * }} opts
 */
export function renderCalendar(
  containerEl,
  { year, month, selectedISO, todayISO, selectionMode = "day", counts = {} }
) {
  containerEl.replaceChildren();

  const weekMode = selectionMode === "week";
  const monthMode = selectionMode === "month";
  const weekSet = weekMode ? new Set(weekDates(selectedISO)) : null;

  const head = document.createElement("div");
  head.className = "calendar__weekdays";
  const wkHead = document.createElement("span");
  wkHead.className = "cal-wk cal-wk--head";
  wkHead.textContent = "WK";
  head.append(wkHead);
  WEEKDAY_NAMES.forEach((name, i) => {
    const cell = document.createElement("span");
    cell.className =
      "calendar__wd" +
      (i === 0 ? " calendar__wd--sun" : i === 6 ? " calendar__wd--sat" : "");
    cell.textContent = name;
    head.append(cell);
  });
  containerEl.append(head);

  const grid = document.createElement("div");
  grid.className = "calendar__days";

  for (const week of monthMatrix(year, month)) {
    // 주 번호 셀 — 주별 보기에서는 클릭 가능(그 주 선택), 그 외엔 표시만.
    const inSelectedWeek = weekMode && week.some((d) => weekSet.has(d.iso));
    const wk = document.createElement(weekMode ? "button" : "span");
    wk.className = "cal-wk" + (weekMode ? " cal-wk--btn" : "");
    wk.textContent = `${weekOfYear(week[0].iso)}`;
    if (weekMode) {
      wk.type = "button";
      wk.dataset.week = week[0].iso;
      wk.setAttribute("aria-label", `WK${weekOfYear(week[0].iso)} 선택`);
      if (inSelectedWeek) wk.classList.add("is-selected");
    }
    grid.append(wk);

    for (const { iso, inMonth } of week) {
      const day = parseISO(iso).getDate();
      const dow = parseISO(iso).getDay();
      const c = counts[iso];

      // 주별 보기에서는 개별 날짜를 못 누르게 span으로 (주 단위로만 이동).
      const cell = document.createElement(weekMode ? "span" : "button");
      cell.className = "cal-cell";
      cell.textContent = String(day);
      if (!weekMode) {
        cell.type = "button";
        cell.dataset.date = iso;
        cell.setAttribute("aria-label", iso);
      }
      if (!inMonth) cell.classList.add("is-outside");
      if (iso === todayISO) cell.classList.add("is-today");
      if (dow === 0) cell.classList.add("is-sunday");
      if (weekSet?.has(iso)) cell.classList.add("in-week");
      if (monthMode && inMonth) cell.classList.add("in-month");
      // 특정 날 선택 표시는 일별 보기에서만 (주·월은 기간 전체를 밴딩)
      if (!weekMode && !monthMode && iso === selectedISO) {
        cell.classList.add("is-selected");
        cell.setAttribute("aria-current", "date");
      }
      if (c && c.total > 0) {
        cell.classList.add("has-tasks");
        if (c.done === c.total) cell.classList.add("all-done");
      }
      grid.append(cell);
    }
  }

  containerEl.append(grid);
}

/** 주별 업무 분석을 렌더링한다 (업무 카테고리별 비중). */
export function renderWeekAnalysis(containerEl, { weekTasks, week }) {
  const breakdown = containerEl.querySelector("#week-breakdown");
  breakdown.replaceChildren();

  if (!weekTasks || weekTasks.length === 0) {
    breakdown.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem;">이 주의 업무가 없습니다</p>';
    return;
  }

  // 업무만 필터링하고 세부분류별 개수 계산
  const businessTasks = weekTasks.filter(t => t.category === "업무");
  if (businessTasks.length === 0) {
    breakdown.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem;">이 주의 업무가 없습니다</p>';
    return;
  }

  const counts = {};
  for (const task of businessTasks) {
    const subcat = task.subcategory ? task.subcategory.split("/")[0] : "미분류";
    counts[subcat] = (counts[subcat] ?? 0) + 1;
  }

  const total = businessTasks.length;
  const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // 색상 배열
  const colors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];

  // 그래프와 항목 렌더링
  const graph = document.createElement("div");
  graph.className = "week-analysis__graph";

  let colorIdx = 0;
  let offset = 0;

  for (const [subcat, count] of items) {
    const percentage = (count / total) * 100;
    const color = colors[colorIdx % colors.length];

    // 그래프 세그먼트
    const segment = document.createElement("div");
    segment.className = "week-analysis__segment";
    segment.style.width = percentage + "%";
    segment.style.backgroundColor = color;
    segment.title = `${subcat} ${count} (${percentage.toFixed(1)}%)`;
    graph.append(segment);

    // 항목 목록
    const item = document.createElement("div");
    item.className = "week-analysis__item";
    item.innerHTML = `
      <span class="week-analysis__item-color" style="background-color: ${color}"></span>
      <span class="week-analysis__item-name">${subcat}</span>
      <span class="week-analysis__item-value">${count} (${percentage.toFixed(1)}%)</span>
    `;
    breakdown.append(item);

    colorIdx++;
    offset += percentage;
  }

  // 그래프를 맨 앞에 삽입
  breakdown.insertBefore(graph, breakdown.firstChild);
}

export { fillCategoryOptions };
