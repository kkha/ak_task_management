"use strict";

import "./styles/theme.css";
import "./styles/components.css";
import { VERSION, APP_TITLE } from "./version.js";
import {
  CATEGORIES,
  addTask,
  toggleTask,
  deleteTask,
  editTask,
  reorderTask,
  sortTasks,
  visibleTasks,
  parseFilter,
  tasksOnDay,
  tasksInWeek,
  tasksInMonth,
  countByDate,
  countBySubcat,
  taskStatus,
  setTaskStatus,
  setTaskPriority,
  setTaskNotes,
  setTaskSubcategory,
  rescheduleTask,
} from "./tasks.js";
import {
  todayISODate,
  addDays,
  addMonths,
  addMonthsClamped,
  isSameMonth,
  parseISO,
  startOfWeek,
  weekOfYear,
  formatMonthTitle,
  WEEKDAY_NAMES,
} from "./dates.js";
import {
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
} from "./storage.js";
import { normalizeSubcats, DEFAULT_SUBCATS } from "./subcats.js";
import {
  renderList,
  renderProgress,
  renderCategoryTree,
  renderActiveFilter,
  renderNotice,
  renderPeriodBar,
  renderCalendar,
  renderWeekAnalysis,
  renderTimeView,
  buildSortOptions,
  fillCategoryOptions,
  fillSubcatOptions,
  fillPriorityOptions,
} from "./render.js";
import { attachDnd } from "./dnd.js";
import {
  KEYWORDS,
  classifyCategory,
  mergeKeywords,
  learnFromText,
  removeKeyword,
} from "./classify.js";
import { initSettingsPanel } from "./settings.js";
import { initHistory } from "./history.js";
import { isBackupTime, loadBackupConfig, getDirHandle, saveBackupConfig } from "./backup.js";

/* ── 런타임 상태 ────────────────────────────────────────────── */
const now = new Date();
const state = {
  tasks: [],
  subcats: normalizeSubcats(DEFAULT_SUBCATS),
  editingId: null,
  expandedNotes: new Set(), // 표시 목록에서 펼친 메모 (비저장)
  expandedNodes: new Set(), // 분류 트리에서 펼친 노드 (비저장)
  // 지금 보고 있는 날짜/기준 날짜(주·월의 앵커). 저장하지 않는다 — 매 로드 시 오늘.
  selectedDate: todayISODate(),
  // 달력에 표시 중인 달(선택 날짜와 독립적으로 넘겨볼 수 있음).
  calYear: now.getFullYear(),
  calMonth: now.getMonth(),
  prefs: {
    filter: "전체",
    sort: "manual",
    hideCompleted: false,
    theme: "system",
    view: "day", // "day" | "week" | "month"
  },
};

/* ── DOM 참조 ──────────────────────────────────────────────── */
const els = {
  form: document.getElementById("task-form"),
  input: document.getElementById("task-input"),
  category: document.getElementById("category-select"),
  subcategory: document.getElementById("subcategory-select"),
  priority: document.getElementById("priority-select"),
  classifyHint: document.getElementById("classify-hint"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsBody: document.getElementById("settings-body"),
  settingsReset: document.getElementById("settings-reset"),
  periodPrev: document.getElementById("period-prev"),
  periodNext: document.getElementById("period-next"),
  periodToday: document.getElementById("period-today"),
  periodLabel: document.getElementById("period-label"),
  viewDay: document.getElementById("view-day"),
  viewWeek: document.getElementById("view-week"),
  viewMonth: document.getElementById("view-month"),
  viewTime: document.getElementById("view-time"),
  viewSeg: document.querySelector(".seg"),
  composerTarget: document.getElementById("composer-target"),
  calPrev: document.getElementById("cal-prev"),
  calNext: document.getElementById("cal-next"),
  calTitle: document.getElementById("cal-title"),
  calendar: document.getElementById("calendar"),
  memo: document.getElementById("memo-input"),
  memoStatus: document.getElementById("memo-status"),
  navPane: document.querySelector(".nav-pane"),
  navToggle: document.getElementById("nav-toggle"),
  categoryTree: document.getElementById("category-tree"),
  activeFilter: document.getElementById("active-filter"),
  subcatEditBtn: document.getElementById("subcat-edit"),
  subcatDialog: document.getElementById("subcat-dialog"),
  subcatBody: document.getElementById("subcat-body"),
  historyBtn: document.getElementById("history-btn"),
  historyDialog: document.getElementById("history-dialog"),
  historySearch: document.getElementById("history-search"),
  historyFrom: document.getElementById("history-from"),
  historyTo: document.getElementById("history-to"),
  historyBody: document.getElementById("history-body"),
  sort: document.getElementById("sort-select"),
  hideCompleted: document.getElementById("hide-completed"),
  taskCount: document.getElementById("task-count"),
  themeToggle: document.getElementById("theme-toggle"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
  notice: document.getElementById("filter-notice"),
  list: document.getElementById("task-list"),
  live: document.getElementById("live-region"),
  appTitle: document.querySelector(".app-bar__title"),
  progress: {
    text: document.getElementById("progress-text"),
    percent: document.getElementById("progress-percent"),
    fill: document.getElementById("progress-fill"),
  },
  weekTitle: document.getElementById("week-title"),
  weekTotalCount: document.getElementById("week-total-count"),
};

const THEME_CYCLE = ["system", "light", "dark"];
const THEME_LABEL = { system: "자동", light: "밝게", dark: "어둡게" };

/* ── 상태 변경 ─────────────────────────────────────────────── */
function commit(nextTasks = state.tasks) {
  state.tasks = nextTasks;
  saveTasks(state.tasks);
  render();
}

function setPrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  savePrefs(state.prefs);
  render();
}

function announce(message) {
  els.live.textContent = "";
  // 같은 문구 반복도 읽히도록 다음 프레임에 넣는다.
  requestAnimationFrame(() => {
    els.live.textContent = message;
  });
}

/* ── 렌더링 ────────────────────────────────────────────────── */
function applyTheme(theme) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  els.themeToggle.textContent = `테마: ${THEME_LABEL[theme]}`;
  els.themeToggle.setAttribute(
    "aria-label",
    `테마 전환 (현재 ${THEME_LABEL[theme]})`
  );
}

/** 현재 보기(일/주/월)에 해당하는 할 일. 정렬·필터 이전 단계. */
function periodTasks() {
  const { view } = state.prefs;
  if (view === "week") return tasksInWeek(state.tasks, state.selectedDate);
  if (view === "month") return tasksInMonth(state.tasks, state.selectedDate);
  return tasksOnDay(state.tasks, state.selectedDate);
}

/** 기간 스코프 목록에 정렬·필터를 적용한다. 주·월 계획은 목록 위로. */
const SCOPE_RANK = { month: 0, week: 1, day: 2 };
function shapeTasks(tasks) {
  const list = visibleTasks(sortTasks(tasks, state.prefs.sort), {
    ...state.prefs,
    subcats: state.subcats,
  });
  if (state.prefs.view === "day") return list;
  // 안정 정렬 — 정해진 정렬 순서를 각 그룹 안에서 유지하며 계획을 앞으로.
  return [...list].sort(
    (a, b) =>
      (SCOPE_RANK[a.scope] ?? 2) - (SCOPE_RANK[b.scope] ?? 2)
  );
}

/** 지금 화면에 그려지는 순서대로의 task 배열(키보드 재정렬용). */
function currentlyShownTasks() {
  return shapeTasks(periodTasks());
}

function render() {
  const { prefs } = state;
  const today = todayISODate();
  applyTheme(prefs.theme);

  const scoped = periodTasks();
  const shown = shapeTasks(scoped);

  // 현재 필터에 맞는 항목들(hideCompleted 미적용) → 숨겨진 항목은 완료 항목만
  const { cat, subpath } = parseFilter(prefs.filter);
  const filtered = scoped.filter((t) => {
    if (cat && t.category !== cat) return false;
    if (subpath !== null) {
      const tsub = typeof t.subcategory === "string" && t.subcategory ? t.subcategory : "";
      if (subpath === "") {
        if (tsub !== "") return false;
      } else {
        const businessMap = state.subcats?.업무 ?? {};
        const parentChildren = businessMap[subpath];
        if (Array.isArray(parentChildren) && parentChildren.length > 0) {
          if (!parentChildren.includes(tsub)) return false;
        } else {
          if (tsub !== subpath) return false;
        }
      }
    }
    return true;
  });

  renderPeriodBar(els, {
    view: prefs.view,
    anchorISO: state.selectedDate,
    todayISO: today,
  });
  els.calTitle.textContent = formatMonthTitle(state.calYear, state.calMonth);
  renderCalendar(els.calendar, {
    year: state.calYear,
    month: state.calMonth,
    selectedISO: state.selectedDate,
    todayISO: today,
    selectionMode: prefs.view,
    counts: countByDate(state.tasks),
  });

  renderProgress(els.progress, scoped); // 진행률은 현재 보기 기준
  renderCategoryTree(els.categoryTree, {
    subcats: state.subcats,
    counts: countBySubcat(scoped),
    activeFilter: prefs.filter,
    expandedNodes: state.expandedNodes,
    onToggle: (nodeKey) => {
      if (state.expandedNodes.has(nodeKey)) {
        state.expandedNodes.delete(nodeKey);
      } else {
        state.expandedNodes.add(nodeKey);
      }
      render();
    },
  });
  renderActiveFilter(els.activeFilter, prefs.filter);
  renderNotice(els.notice, filtered.length - shown.length);

  const dayView = prefs.view === "day";
  const timeView = prefs.view === "time";

  // 시간별 보기일 때 입력 폼과 제어 요소들 HIDE (READ-ONLY)
  els.form.hidden = timeView;
  els.sort.parentElement.hidden = timeView;
  els.hideCompleted.parentElement.hidden = timeView;
  if (els.taskCount) {
    els.taskCount.hidden = timeView;
    els.taskCount.textContent = `총 ${shown.length}개`;
  }

  els.sort.value = prefs.sort;
  els.hideCompleted.checked = prefs.hideCompleted;

  // 주·월 보기에서는 새 할 일이 그 주/달 "계획"으로 들어감을 안내한다.
  if (dayView || timeView) {
    els.composerTarget.hidden = true;
  } else {
    const d = parseISO(state.selectedDate);
    els.composerTarget.hidden = false;
    els.composerTarget.textContent =
      prefs.view === "week"
        ? `＋ 이번 주(WK${weekOfYear(state.selectedDate)}) 계획으로 추가됩니다`
        : `＋ ${formatMonthTitle(d.getFullYear(), d.getMonth())} 계획으로 추가됩니다`;
  }

  if (timeView) {
    renderTimeView(els.list, state.tasks, {
      anchorDate: state.selectedDate,
      editingId: state.editingId,
      expandedNotes: state.expandedNotes,
      onDragStart: (e, task) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/json", JSON.stringify(task));
      },
      onTaskClick: (e, task) => {
        if (!e.target.closest(".task__drag-handle")) {
          state.editingId = task.id;
          render();
        }
      },
    });
  } else {
    renderList(els.list, shown, {
      editingId: state.editingId,
      manualSort: prefs.sort === "manual",
      showDate: prefs.view !== "day", // 주·월 통합 목록은 행마다 날짜 표기
      todayISO: today,
      viewISO: state.selectedDate, // 일별 보기에서 "N일차" 계산용
      view: prefs.view, // 뷰 타입 추가
      subcats: state.subcats,
      expandedNotes: state.expandedNotes,
      emptyKind: scoped.length === 0 ? "period" : "filtered",
    });
  }

  // 주별 업무 분석 (selectedDate 기준으로 자동 계산)
  const weekStart = startOfWeek(state.selectedDate);
  const weekEnd = addDays(weekStart, 6);
  const weekNum = weekOfYear(state.selectedDate);
  const weekTasks = state.tasks.filter((t) => {
    const d = parseISO(t.date);
    return d >= parseISO(weekStart) && d <= parseISO(weekEnd);
  });
  els.weekTitle.textContent = `W${weekNum} 업무 현황`;
  els.weekTotalCount.textContent = weekTasks.filter((t) => t.category === "업무").length;
  renderWeekAnalysis(document.querySelector(".week-analysis__body"), {
    weekTasks,
    week: weekNum,
  });
}

/** composer 의 세부분류 <select>를 현재 카테고리에 맞게 채운다. */
function syncComposerSubcats() {
  fillSubcatOptions(els.subcategory, els.category.value, state.subcats, "");
  els.subcategory.hidden = (state.subcats[els.category.value] ?? []).length === 0;
}

/** 선택한 날짜가 달력에 보이도록 표시 중인 달을 맞춘다. */
function syncCalendarToSelection() {
  if (!isSameMonth(state.selectedDate, state.calYear, state.calMonth)) {
    const d = parseISO(state.selectedDate);
    state.calYear = d.getFullYear();
    state.calMonth = d.getMonth();
  }
}

/* ── 자동 분류 + 학습 ─────────────────────────────────────────
 * 입력 중 내용을 보고 카테고리를 추측해 드롭다운을 맞춘다.
 * 사용자가 드롭다운을 직접 바꾸면(categoryTouched) 추측을 멈추고,
 * 그 교정을 키워드로 학습해 다음부터 자동 분류에 반영한다.
 */
let categoryTouched = false;
let classifier = loadClassifier(); // { custom, learned }

/** 내장 + 사용자 추가 + 학습 키워드를 합친 것. */
function mergedKeywords() {
  return mergeKeywords(KEYWORDS, classifier.custom, classifier.learned);
}

function setClassifier(next) {
  classifier = next;
  saveClassifier(classifier);
}

function showHintText(text) {
  els.classifyHint.textContent = text;
  els.classifyHint.hidden = false;
}

function refreshAutoCategory() {
  if (categoryTouched) {
    els.classifyHint.hidden = true;
    return;
  }
  const guess = classifyCategory(els.input.value, mergedKeywords());
  if (guess) {
    if (els.category.value !== guess) {
      els.category.value = guess;
      syncComposerSubcats();
    }
    showHintText(`📂 '${guess}'(으)로 자동 분류됨 · 직접 바꿀 수 있어요`);
  } else {
    els.classifyHint.hidden = true;
  }
}

/** 수동 교정을 학습하고, 되돌리기 버튼이 달린 안내를 띄운다. */
function learnCorrection(text, category) {
  if (!text.trim()) {
    els.classifyHint.hidden = true;
    return;
  }
  const { config, added } = learnFromText(classifier, text, category);
  if (added.length === 0) {
    els.classifyHint.hidden = true;
    return;
  }
  setClassifier(config);

  els.classifyHint.replaceChildren(
    document.createTextNode(
      `🧠 '${added.join(", ")}' → ${category} 키워드로 학습됨 · `
    )
  );
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "linklike";
  undo.textContent = "되돌리기";
  undo.addEventListener("click", () => {
    let c = classifier;
    for (const kw of added) c = removeKeyword(c, category, kw);
    setClassifier(c);
    els.classifyHint.hidden = true;
    els.input.focus();
  });
  els.classifyHint.append(undo);
  els.classifyHint.hidden = false;
}

els.input.addEventListener("input", refreshAutoCategory);
els.category.addEventListener("change", () => {
  syncComposerSubcats();
  const text = els.input.value;
  const guessed = classifyCategory(text, mergedKeywords());
  categoryTouched = true;
  if (guessed !== els.category.value) {
    learnCorrection(text, els.category.value);
  } else {
    els.classifyHint.hidden = true;
  }
});

/* ── 자동 백업 상태 표시 업데이트 ──────────────────────────────── */
function updateBackupStatus() {
  const backupStatus = document.getElementById("backup-status");
  const config = loadBackupConfig();
  backupStatus.hidden = !config.enabled;
}

// tree-shaking 방지: window 객체에 할당해서 side effects 강제
window._settingsInit = initSettingsPanel({
  dialog: els.settingsDialog,
  openBtn: els.settingsBtn,
  getConfig: () => classifier,
  setConfig: (next) => {
    setClassifier(next);
    refreshAutoCategory();
  },
  getSubcats: () => state.subcats,
  setSubcats: (next) => {
    state.subcats = next;
    saveSubcats(state.subcats);
    syncComposerSubcats();
    render();
  },
  getTasks: () => state.tasks,
  setTasks: (next) => {
    state.tasks = next;
    commit();
  },
  onExport: doExport,
  onImport: (file) => doImport(file),
  onSaveBackup: updateBackupStatus,
});

/* ── 메모 (좌측 패널) ──────────────────────────────────────── */
els.memo.value = loadMemo();
let memoTimer = null;
els.memo.addEventListener("input", () => {
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => {
    saveMemo(els.memo.value);
    els.memoStatus.textContent = "저장됨";
    setTimeout(() => {
      els.memoStatus.textContent = "";
    }, 1500);
  }, 400);
});

function resetComposer() {
  els.input.value = "";
  els.priority.value = "normal";
  els.subcategory.value = "";
  categoryTouched = false;
  els.classifyHint.hidden = true;
}

/* ── 이벤트: 추가 / 필터 / 정렬 / 숨김 / 테마 ────────────────── */
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.input.value;
  if (!text.trim()) return;

  const base = {
    text,
    category: els.category.value,
    date: state.selectedDate,
    scope: state.prefs.view,
    subcategory: els.subcategory.value,
    priority: els.priority.value,
  };
  // 보기 단위대로 등록: 일별=그 날, 주별=그 주 계획, 월별=그 달 계획.
  commit(addTask(state.tasks, text, base));
  resetComposer();
  els.input.focus();
});

/* ── 이벤트: 기간 이동 / 일·주 전환 / 달력 ──────────────────── */
function goToDate(iso) {
  state.selectedDate = iso;
  state.editingId = null;
  syncCalendarToSelection();
  render();
}

/** 현재 보기 기준으로 앵커 날짜를 delta(±1)만큼 이동. */
function stepPeriod(delta) {
  const { view } = state.prefs;
  if (view === "month") {
    return goToDate(addMonthsClamped(state.selectedDate, delta));
  }
  return goToDate(addDays(state.selectedDate, delta * (view === "week" ? 7 : 1)));
}

els.periodPrev.addEventListener("click", () => stepPeriod(-1));
els.periodNext.addEventListener("click", () => stepPeriod(1));
els.periodToday.addEventListener("click", () => goToDate(todayISODate()));

els.viewSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn || btn.dataset.view === state.prefs.view) return;
  state.editingId = null;
  syncCalendarToSelection();
  setPrefs({ view: btn.dataset.view });
});

els.calendar.addEventListener("click", (e) => {
  // 주별 보기: WK 열(주 번호)만 클릭 가능 → 그 주로 이동.
  const wk = e.target.closest("button[data-week]");
  if (wk) {
    goToDate(wk.dataset.week);
    return;
  }
  const btn = e.target.closest("button[data-date]");
  if (btn) goToDate(btn.dataset.date);
});

/** 달력 달 넘기기. 월별 보기에서는 선택 자체를 옮긴다(달력=선택 달). */
function stepCalendarMonth(delta) {
  if (state.prefs.view === "month") return stepPeriod(delta);
  ({ year: state.calYear, month: state.calMonth } = addMonths(
    state.calYear,
    state.calMonth,
    delta
  ));
  render();
}
els.calPrev.addEventListener("click", () => stepCalendarMonth(-1));
els.calNext.addEventListener("click", () => stepCalendarMonth(1));

els.categoryTree.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  state.editingId = null;
  els.navPane.classList.remove("is-open"); // 좁은 화면: 고르면 닫기

  const filter = btn.dataset.filter;
  // 트리에서 고른 분류를 입력창에도 반영한다 → 그대로 "추가"하면 그 분류로 저장.
  // (세부분류 이름에 "/"가 들어갈 수 있으므로 첫 "/"만 기준으로 나눈다)
  if (filter !== "전체") {
    const { cat, subpath } = parseFilter(filter);
    els.category.value = cat;
    categoryTouched = true; // 자동 분류가 이 선택을 덮어쓰지 않게
    els.classifyHint.hidden = true;
    syncComposerSubcats();
    els.subcategory.value =
      subpath && Array.from(els.subcategory.options).some((o) => o.value === subpath) ? subpath : "";
  }
  setPrefs({ filter });
});

els.activeFilter.addEventListener("click", () => {
  state.editingId = null;
  setPrefs({ filter: "전체" });
});

els.navToggle.addEventListener("click", () => {
  els.navPane.classList.toggle("is-open");
});

// 통합 설정 패널에 포함됨

initHistory({
  dialog: els.historyDialog,
  openBtn: els.historyBtn,
  searchEl: els.historySearch,
  fromEl: els.historyFrom,
  toEl: els.historyTo,
  bodyEl: els.historyBody,
  getTasks: () => state.tasks,
});

els.sort.addEventListener("change", () => {
  state.editingId = null;
  setPrefs({ sort: els.sort.value });
});

els.hideCompleted.addEventListener("change", () => {
  setPrefs({ hideCompleted: els.hideCompleted.checked });
});

els.themeToggle.addEventListener("click", () => {
  const next =
    THEME_CYCLE[
      (THEME_CYCLE.indexOf(state.prefs.theme) + 1) % THEME_CYCLE.length
    ];
  setPrefs({ theme: next });
});

/* ── 내보내기 / 가져오기 함수 ───────────────────────────────── */
function doExport() {
  const blob = new Blob(
    [serializeExport(state.tasks, els.memo.value, state.subcats, loadBackupConfig())],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `task-app-${stamp}.json`;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
  announce("할 일을 파일로 내보냈습니다.");
}

/** 자동 백업용 내보내기 (설정된 폴더와 파일명 사용). */
async function doExportAutomatic() {
  const config = loadBackupConfig();
  const fileName = config.fileName || "task-backup.json";
  const dirHandle = getDirHandle();
  const data = serializeExport(state.tasks, els.memo.value, state.subcats, config);

  if (dirHandle) {
    try {
      // 권한 확인
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        console.warn("폴더 쓰기 권한 없음, 다운로드로 대체");
        throw new Error('권한 없음');
      }

      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      console.info(`✓ 자동 백업 성공: ${dirHandle.name}/${fileName}`);
      return;
    } catch (err) {
      console.warn("File System Access API 저장 실패, 다운로드로 대체:", err.message);
    }
  } else {
    console.info("폴더 선택 안 됨, 다운로드로 백업합니다");
  }

  // 폴더 핸들이 없거나 실패하면 다운로드
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
  console.info(`↓ 자동 백업 (다운로드): ${fileName}`);
}

async function doImport(file) {
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch {
    announce("파일을 읽지 못했습니다.");
    return;
  }

  const result = parseImport(text);
  if (!result.ok) {
    announce(`가져오기 실패: ${result.error}`);
    window.alert(`가져오기에 실패했습니다.\n${result.error}`);
    return;
  }

  const replace = window.confirm(
    `${result.tasks.length}개의 할 일을 가져왔습니다.\n` +
      `확인 = 현재 목록을 교체 / 취소 = 기존 목록에 병합`
  );

  if (replace) {
    state.editingId = null;
    // 메모와 세부분류도 함께 교체
    els.memo.value = result.memo || "";
    saveMemo(els.memo.value);
    if (result.subcategories) {
      state.subcats = result.subcategories;
      saveSubcats(state.subcats);
    }
    if (result.backupConfig) {
      saveBackupConfig(result.backupConfig);
      updateBackupStatus();
    }
    commit(result.tasks);
    announce(`${result.tasks.length}개 할 일로 교체했습니다.`);
  } else {
    const existingIds = new Set(state.tasks.map((t) => t.id));
    const merged = [
      ...state.tasks,
      ...result.tasks.filter((t) => !existingIds.has(t.id)),
    ];
    const added = merged.length - state.tasks.length;
    // 병합할 때는 메모와 세부분류 병합 (기존 데이터 유지, 새 세부분류 추가)
    if (result.memo) {
      els.memo.value = (els.memo.value ? els.memo.value + "\n" : "") + result.memo;
      saveMemo(els.memo.value);
    }
    if (result.subcategories) {
      const mergedSubcats = { ...state.subcats };
      for (const cat of CATEGORIES) {
        if (cat === "업무") {
          const targetWumup = { ...(state.subcats.업무 || {}) };
          const sourceWumup = result.subcategories.업무 || {};
          for (const [parent, children] of Object.entries(sourceWumup)) {
            const targetChildren = Array.isArray(targetWumup[parent]) ? targetWumup[parent] : [];
            const sourceChildren = Array.isArray(children) ? children : [];
            targetWumup[parent] = Array.from(new Set([...targetChildren, ...sourceChildren]));
          }
          mergedSubcats.업무 = targetWumup;
        } else {
          mergedSubcats[cat] = Array.from(
            new Set([...(state.subcats[cat] || []), ...(result.subcategories[cat] || [])])
          );
        }
      }
      state.subcats = mergedSubcats;
      saveSubcats(state.subcats);
    }
    commit(merged);
    announce(`${added}개 할 일을 병합했습니다.`);
  }
}

/* ── 이벤트: 목록 위임 (완료/수정/삭제/편집) ────────────────── */
function idFromEvent(e) {
  const li = e.target.closest("li[data-id]");
  if (li) return li.dataset.id;
  // 시간별 보기: 메모 영역에서 호출된 경우 형제 또는 부모의 task 엘리먼트 찾기
  const current = e.target.closest(".time-slot__task-notes");
  if (current) {
    const taskEl = current.previousElementSibling?.closest("div[data-id].time-slot__task") ||
                   current.parentElement?.querySelector("div[data-id].time-slot__task");
    if (taskEl) return taskEl.dataset.id;
  }
  // 직접 task 엘리먼트에서 호출된 경우
  const div = e.target.closest("div[data-id].time-slot__task");
  return div ? div.dataset.id : null;
}

function commitEditFrom(li) {
  const id = li.dataset.id;
  const val = (sel) => li.querySelector(sel).value;
  const text = val(".edit-input");
  const category = val(".edit-category");
  if (!text.trim()) {
    li.querySelector(".edit-input").focus();
    return;
  }
  const before = state.tasks.find((t) => t.id === id);
  const categoryChanged = before && before.category !== category;
  state.editingId = null;

  let next = editTask(state.tasks, id, text, category);
  next = setTaskSubcategory(next, id, val(".edit-subcategory"), state.subcats[category]);
  next = setTaskPriority(next, id, val(".edit-priority"));
  next = setTaskNotes(next, id, val(".edit-notes"));
  next = rescheduleTask(next, id, {
    date: val(".edit-date"),
    endDate: val(".edit-enddate") || null,
    scope: val(".edit-scope"),
  });

  // 시간 할당 처리
  const timeAssign = val(".edit-time-assign");
  if (timeAssign === "시간할당") {
    const startTime = val(".edit-time");
    next = next.map((t) => (t.id === id ? { ...t, startTime } : t));
  } else {
    next = next.map((t) => (t.id === id ? { ...t, startTime: undefined } : t));
  }

  commit(next);
  // 기존 항목의 카테고리를 직접 바꾼 것도 교정 신호로 학습한다.
  if (categoryChanged) learnCorrection(text, category);
}

/** 표시 목록에서 메모 저장 (편집 중 재렌더로 포커스가 튀지 않게 render 안 함). */
const notesTimers = new Map();
function saveNotesQuiet(id, val) {
  state.tasks = setTaskNotes(state.tasks, id, val);
  saveTasks(state.tasks);
}

els.list.addEventListener("click", (e) => {
  const id = idFromEvent(e);
  if (id === null) return;
  const t = e.target;

  if (t.classList.contains("task-check")) {
    commit(toggleTask(state.tasks, id));
  } else if (t.classList.contains("task-doing")) {
    const cur = taskStatus(state.tasks.find((x) => x.id === id));
    commit(setTaskStatus(state.tasks, id, cur === "doing" ? "todo" : "doing"));
  } else if (t.classList.contains("task__notes-toggle")) {
    if (state.expandedNotes.has(id)) state.expandedNotes.delete(id);
    else state.expandedNotes.add(id);
    render();
    els.list.querySelector(`li[data-id="${CSS.escape(id)}"] .task__notes`)?.focus();
  } else if (t.classList.contains("task-delete")) {
    if (state.editingId === id) state.editingId = null;
    state.expandedNotes.delete(id);
    commit(deleteTask(state.tasks, id));
  } else if (t.classList.contains("task-edit")) {
    state.editingId = id;
    render();
  } else if (t.classList.contains("edit-save")) {
    commitEditFrom(t.closest("li[data-id]"));
  } else if (t.classList.contains("edit-cancel")) {
    state.editingId = null;
    render();
  }
});

els.list.addEventListener("input", (e) => {
  if (!e.target.classList.contains("task__notes")) return;
  const id = idFromEvent(e);
  if (id === null) return;
  const val = e.target.value;
  clearTimeout(notesTimers.get(id));
  notesTimers.set(
    id,
    setTimeout(() => saveNotesQuiet(id, val), 500)
  );
});

els.list.addEventListener(
  "blur",
  (e) => {
    if (!e.target.classList.contains("task__notes")) return;
    const id = idFromEvent(e);
    if (id === null) return;
    clearTimeout(notesTimers.get(id));
    saveNotesQuiet(id, e.target.value);
    // 메모가 비었고 펼침만 해둔 상태였으면 접는다
    if (!e.target.value.trim()) state.expandedNotes.delete(id);
    render();
  },
  true // capture — blur 는 버블링 안 함
);

els.list.addEventListener("dblclick", (e) => {
  if (!e.target.classList.contains("task__text")) return;
  const id = idFromEvent(e);
  if (id !== null) {
    state.editingId = id;
    render();
  }
});

els.list.addEventListener("keydown", (e) => {
  // 편집 입력창: Enter 저장 / Esc 취소
  if (e.target.classList.contains("edit-input")) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEditFrom(e.target.closest("li[data-id]"));
    } else if (e.key === "Escape") {
      e.preventDefault();
      state.editingId = null;
      render();
    }
    return;
  }

  // 드래그 핸들: ArrowUp / ArrowDown 으로 순서 변경 (수동 정렬일 때만).
  // 화면에 보이는 목록 기준으로 바로 위/아래 항목과 자리를 바꾼다.
  // 주·월 통합 목록에서 날짜는 달라도 되지만, 계획(주/월)↔일반 경계는 넘지 않는다.
  if (
    e.target.classList.contains("task__drag") &&
    !e.target.disabled &&
    (e.key === "ArrowUp" || e.key === "ArrowDown")
  ) {
    e.preventDefault();
    const id = idFromEvent(e);
    const shown = currentlyShownTasks();
    const idx = shown.findIndex((t) => t.id === id);
    const up = e.key === "ArrowUp";
    const neighbor = shown[idx + (up ? -1 : 1)];
    if (idx === -1 || !neighbor) return;
    if ((neighbor.scope ?? "day") !== (shown[idx].scope ?? "day")) return;
    commit(
      reorderTask(state.tasks, id, neighbor.id, up ? "before" : "after")
    );
    els.list
      .querySelector(`li[data-id="${CSS.escape(id)}"] .task__drag`)
      ?.focus();
    announce(`${up ? "위로" : "아래로"} 이동했습니다.`);
  }
});

/* ── 드래그 앤 드롭 ────────────────────────────────────────── */
attachDnd(els.list, (fromId, toId, place) => {
  commit(reorderTask(state.tasks, fromId, toId, place));
});

// 시간별 뷰: 시간 슬롯에 드롭하면 startTime 업데이트
els.list.addEventListener("dragover", (e) => {
  if (state.prefs.view !== "time") return;
  const timeSlot = e.target.closest(".time-slot__tasks");
  if (timeSlot) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    timeSlot.classList.add("time-slot__tasks--drag-over");
  }
});

els.list.addEventListener("dragleave", (e) => {
  if (state.prefs.view !== "time") return;
  const timeSlot = e.target.closest(".time-slot__tasks");
  if (timeSlot) {
    timeSlot.classList.remove("time-slot__tasks--drag-over");
  }
});

els.list.addEventListener("drop", (e) => {
  if (state.prefs.view !== "time") return;
  const timeSlot = e.target.closest(".time-slot__tasks");
  if (!timeSlot) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  timeSlot.classList.remove("time-slot__tasks--drag-over");

  try {
    const taskData = JSON.parse(e.dataTransfer.getData("application/json"));
    const taskIdx = state.tasks.findIndex((t) => t.id === taskData.id);
    if (taskIdx === -1) return;

    const slot = timeSlot.closest(".time-slot");
    const slotTime = slot?.dataset.time;
    if (!slotTime) return;

    // startTime 설정
    const setTaskStartTime = (task, time) => ({ ...task, startTime: time });
    state.tasks[taskIdx] = setTaskStartTime(state.tasks[taskIdx], slotTime);
    commit();
  } catch (err) {
    console.warn("드래그 드롭 처리 중 오류:", err);
  }
});

/* ── 초기화 ────────────────────────────────────────────────── */
/** 브라우저 탭·앱 바 제목에 버전을 붙인다. */
function applyAppTitle() {
  document.title = APP_TITLE;
  if (els.appTitle) {
    els.appTitle.textContent = "Task Management";
    const ver = document.createElement("span");
    ver.className = "app-bar__ver";
    ver.textContent = `v${VERSION}`;
    els.appTitle.append(" ", ver);
  }
}

/** 업무 세부분류 변경 후 일관성이 없는 subcategory를 정규화한다. */
function normalizeTaskSubcatsAfterLoad() {
  const wumupMap = state.subcats.업무 || {};
  const validParents = new Set(Object.keys(wumupMap));
  let fixed = false;
  const updated = state.tasks.map((t) => {
    if (t.category !== "업무" || !t.subcategory) return t;
    const i = t.subcategory.indexOf("/");
    if (i === -1) return t; // "부모/자식" 형식이 아니면 패스
    const parent = t.subcategory.slice(0, i);
    if (!validParents.has(parent)) {
      fixed = true;
      return { ...t, subcategory: undefined };
    }
    return t;
  });
  if (fixed) {
    state.tasks = updated;
    commit();
    console.info("일관성 없는 세부분류를 정규화했습니다.");
  }
}

function init() {
  applyAppTitle();
  fillCategoryOptions(els.category, CATEGORIES[0]);
  buildSortOptions(els.sort, "manual");
  fillPriorityOptions(els.priority, "normal");

  state.tasks = loadTasks();
  state.prefs = loadPrefs();
  state.subcats = loadSubcats();
  normalizeTaskSubcatsAfterLoad();
  syncComposerSubcats();
  render();
  // index.html의 "직접 열기" 안내를 끄는 신호.
  window.__APP_BOOTED__ = true;
  console.info(`할 일 ${state.tasks.length}개를 불러왔습니다.`);

  // 자동 백업 상태 표시
  updateBackupStatus();

  // 자동 백업 체크 (매분)
  setInterval(() => {
    const config = loadBackupConfig();
    if (isBackupTime(config)) {
      doExportAutomatic();
    }
  }, 60000);
}

init();
