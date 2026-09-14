# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**AK Task Management** — a personal to-do app (Korean UI, English name). Client-only,
no backend, no runtime dependencies.

- **Dev:** `npm run dev` (Vite dev server).
- **Build:** `npm run build` → `dist/index.html`, a single file with all CSS/JS
  inlined. It opens both from static hosting and by double-clicking (`file://`).
- **Verify:** `npm test` (Vitest), `npm run lint` (ESLint), `npm run build`.
  `npm run screenshot` builds then drives the real page in headless Chromium
  (`scripts/shot.mjs`, Playwright) and writes PNGs to `scripts/screenshots/`
  (gitignored) — use it to eyeball layout/theme changes.
- **Icon:** `npm run icon` (`scripts/make-icon.mjs`) → `assets/app-icon.ico` (16–256px,
  32-bit BMP-in-ICO, drawn pixel-by-pixel in pure Node — no deps) AND rewrites
  `index.html`'s `<link rel="icon">` to a 64px PNG data URI of the same mark (pure
  Node PNG encoder via `zlib`). Accent-indigo rounded square + white check. The
  committed `index.html` keeps the generated favicon tag; `assets/` is gitignored;
  `npm run package` regenerates both.
- **Package:** `npm run package` (`scripts/package.mjs`, runs `build` + `make-icon` first)
  → `release/AK Task Management/`: the single-file `index.html` (**double-click opens it
  in the default browser**), `app-icon.ico`, an `AK Task Management.lnk` whose target is
  **`explorer.exe`** with `index.html` as its argument (a real exe → Windows 11 shows
  "작업 표시줄에 고정"; browser-agnostic) using `app-icon.ico`, `_shortcut.ps1` +
  `바로가기 만들기.cmd` (regenerate the `.lnk` with correct paths on the target PC),
  `변경이력.txt`, `사용법.txt`. Plus a zip. `.ps1`/`.txt` are UTF-8 **with BOM**.
  `release/` is gitignored. (v4 dropped the old `.cmd` `--app`-mode launcher.)
  Playwright is a devDependency (used only by `shot.mjs`).

Planning docs: `PRD.md` (requirements, section 9 is the acceptance checklist),
`BUILD_PROMPTS.md` (historical — the original 5-step build; predates v2).
`README.md` is user-facing. `CHANGELOG.md` is the version history (Keep a Changelog
style) — add an entry there whenever you bump the version.

**Versioning:** `src/version.js` exports `VERSION` (semver) and `APP_TITLE`. It must
equal `package.json`'s `version` — `tests/version.test.js` enforces that and checks
`CHANGELOG.md` has a `## [VERSION]` entry. `main.js` writes `document.title` and the
`.app-bar__title` (name + a muted `.app-bar__ver` span) from it; `serializeExport`
stamps `appVersion`. Bumping the version = edit both files + add a CHANGELOG entry.

The UI is a full-width **3-column `.layout`**: `.nav-pane` (category + user-managed
sub-category tree, filters the list) | `.cal-pane` (month calendar with WK column +
memo sticker) | `.detail-pane` (selected period's task management). At ≤1180px the
nav-pane becomes a `#nav-toggle`-driven slide-over; at ≤820px everything stacks.
`.detail-pane` is capped at `max-width: 1180px` so rows don't get absurdly long on
ultrawide screens.

## Hard constraints (do not break without explicit approval)

- **No runtime dependencies / no framework.** Vanilla JS + hand-written CSS
  (`src/styles/`). Dev tooling (Vite, Vitest, ESLint, Prettier) is fine; nothing
  ships to the browser except hand-written JS/CSS.
- **Persistence keys** — `localStorage`:
  - `task-app.tasks` — JSON array of `Task`. Required: `id, text, category, completed,
    createdAt, date`. All others optional and **only written when non-default** — old
    data stays lean; `sanitizeTasks()` strips unknown/inconsistent values but keeps the
    task, `isValidTask()` rejects malformed ones. `category` ∈ `개인`/`업무`/`공부`
    (`CATEGORIES`); `date` `"YYYY-MM-DD"` local (v3; backfilled from `createdAt`).
    Optional fields (helpers in `tasks.js`):
    - `scope` `week`/`month` — period the task belongs to (v3.3). Absent = `day` (`taskScope`).
    - `status` `"doing"` — the "작업중" state (v4). done is `completed`; else todo. `taskStatus`.
    - `priority` `"high"`/`"low"` — default normal (v4). `taskPriority`.
    - `subcategory` string — one of the category's `task-app.subcategories` list (v4).
    - `endDate` `"YYYY-MM-DD"` — multi-day span end, inclusive; only when `> date` (v4). `taskEndDate`.
    - `notes` string — per-item detail (v4).
    - `doneAt` number(ms) — set on completion, cleared on un-complete; powers history (v4).
    - `recurrence` `{freq: daily|weekdays|weekly, days?, until?}` + `series` string — repeats (v4).
      Instances are materialized (not virtual); `buildSeries`/`topUpSeries`/`expandRecurrence`.
  - `task-app.subcategories` — `{ 개인: string[], 업무: string[], 공부: string[] }` (v4).
    Pure CRUD in `src/subcats.js` (`addSubcat`/`removeSubcat`/`renameSubcat`/`normalizeSubcats`);
    `loadSubcats`/`saveSubcats` in storage. Seeded with 업무 examples on first run.
    Renaming a sub-category does NOT cascade to tasks — stale `subcategory` just reads as 미분류.
  - `task-app.prefs` — `{ filter, sort, hideCompleted, theme, view }`. `filter` is now
    `"전체"` | a category | `"카테고리/세부분류"` | `"카테고리/"` (미분류); `parseFilter()` in
    tasks.js splits it, `visibleTasks` applies it. `sort` gained `"priority"`. Unknown
    values fall back to defaults in `loadPrefs()`. `view` ∈ `day`/`week`/`month`.
  - `task-app.memo` — plain string, the left-pane memo sticker (`loadMemo`/`saveMemo`,
    debounced ~400ms on input in `main.js`).
  - `task-app.classifier` — `{ custom, learned }`, each a category→keyword-array
    map of user-added / auto-learned classifier keywords. Normalized on load.
- The build must stay double-click runnable (`vite-plugin-singlefile`).

## Architecture (`src/`, ES modules)

- **`dates.js`** — pure, zero-import date helpers, all local-timezone. Dates flow
  as `"YYYY-MM-DD"` strings (zero-padded → string compare == date compare, used for
  week/month-range filtering). Months are 0-indexed like `Date`. Weeks start Sunday
  (`WEEK_START`, `startOfWeek`/`weekDates`/`monthMatrix`). `weekOfYear` is a
  Sunday-based year-week count (the week containing Jan 1 is week 1), keyed to the
  date's own Gregorian year. Also `startOfMonth`/`endOfMonth`/`addMonthsClamped`
  and the display formatters (`formatDayLabel`/`formatWeekLabel`/`formatMonthTitle`/
  `formatMonthDayHeading`/`formatShortDay` — the last is the compact per-row date
  badge, `"오늘"` / `"9/8 (화)"`).
- **`tasks.js`** — pure domain logic. No DOM, no storage, no globals. Every
  function returns a new value and never mutates its input: `createTask`
  (takes a `date`, default today), `addTask`, `toggleTask`, `deleteTask`,
  `editTask`, `reorderTask`, `moveTask`, `sortTasks`, `visibleTasks`, `progress`,
  plus the period scopers `tasksOnDay` (day-scoped only) / `tasksInWeek` (day + that
  week's `week`-scoped; excludes `month`) / `tasksInMonth` (everything in the month:
  day + week + month) / `countByDate` (calendar dots — day-scoped only) / `countByFilter`
  (filter-chip counts `{전체, 개인, 업무, 공부}`, over the period-scoped list, ignoring the
  active filter and hide-completed). `taskScope`/`taskStatus`/`taskPriority`/`taskEndDate`
  normalize their fields. Mutators (return new arrays): `setTaskStatus`/`setTaskPriority`/
  `setTaskNotes`/`setTaskSubcategory`/`rescheduleTask({date, endDate, scope})`. Recurrence:
  `buildSeries`/`topUpSeries`/`expandRecurrence`/`deleteSeriesFrom`/`recurrenceLabel`.
  History: `historyEntries({query, from, to})`. `SORT_MODES` gained `"priority"` and
  `"date-asc"`. The render pipeline is
  **period scope → sortTasks → visibleTasks**, one flat list per view. Most heavily tested.
- **`classify.js`** — pure. `classifyCategory(text)` → `개인`/`업무`/`공부` or
  `null` (unsure/ambiguous), by counting per-category keyword hits in `KEYWORDS`.
  No network — the app is offline-only, so this is deliberately rule-based, not an
  LLM call. `main.js` uses it to steer the composer's category `<select>` on
  `input`, unless the user has manually changed the select (`categoryTouched`).
- **`subcats.js`** — pure per-category sub-category CRUD (see persistence keys above).
  No DOM/storage. Imports `CATEGORIES` from tasks.js (no cycle).
- **`settings.js`** — two `<dialog>` initializers: `initSettings` (the `분류 설정`
  keyword dialog — pure ops in `classify.js`) and `initSubcatEditor` (the `세부분류
  편집` dialog — pure ops in `subcats.js`). Both are DOM-only; persist via a `setConfig`/
  `setMap` callback from `main.js`. `window.prompt` is used for sub-category rename.
- **`history.js`** — `initHistory` for the `완료 히스토리` `<dialog>`: renders
  `historyEntries()` grouped by completion day, live-filtered by search box + from/to
  date inputs. DOM-only; reads tasks via a `getTasks` callback.
- **`storage.js`** — the data layer. `loadTasks`/`saveTasks`/`loadPrefs`/`savePrefs`
  all take an injectable `store` (defaults to `safeStorage()`) and are wrapped in
  try/catch — a parse failure or blocked storage (incognito) must never throw.
  `isValidTask` / `sanitizeTasks` are the schema boundary: anything read from
  storage or an import file passes through them. `serializeExport` / `parseImport`
  handle the JSON export/import feature.
- **`render.js`** — DOM construction only. `createElement` + `textContent`, never
  `innerHTML` (task text is user input). Reads nothing global; needed values are
  arguments. `renderList` draws all three views as **one flat list** — day shows
  that day; week/month show the whole period integrated (no day grouping), with a
  per-row meta badge when `opts.showDate` (true for week/month): a date
  (`.task__date`, "오늘"/"9/8 (화)") for day-scoped rows, or a plan pill
  (`.task__scope--week` "WK37" / `.task__scope--month` "9월", separate colors) for
  week/month-scoped rows. `renderCalendar` (month grid + WK column, rebuilt every
  render) switches on `selectionMode`: `day` → day cells are `<button data-date>`;
  `week` → day cells become inert `<span>` and the **WK column becomes
  `<button data-week>`** (click selects that week), selected week banded `.in-week`;
  `month` → whole displayed month banded `.in-month`, day cells stay clickable.
  `renderPeriodBar` (day/week/month label + toggle state). `renderCategoryTree`
  (`.nav-pane` — `<button data-filter>` rows: 전체, each category, its sub-categories,
  and 미분류 when >0; counts from `countBySubcat(periodScoped)`) + `renderActiveFilter`
  (the toolbar "카테고리 › 세부분류 ✕" pill). Each task row is
  `<li><div class="task__main">…</div>[<textarea class="task__notes">]</li>`: drag,
  done checkbox, `.task-doing` toggle, priority marker, text, `.task__notes-toggle`,
  sub-category chip, 🔁 recur badge, date/span/scope badge, category chip, 수정, 삭제.
  `li` classes `task--doing` / `task--prio-high` / `task--prio-low`. Editing swaps the
  `<li>` for a 3-row edit card (text / category·sub·priority / scope·date·endDate + save/cancel,
  then a notes textarea). Multi-day rows show `formatDaySpan` in week/month, "N일차" in day.
- **`dnd.js`** — drag-and-drop reordering, delegated on the list container.
  Calls back `onReorder(fromId, toId, place)`; it does not touch state.
- **`version.js`** — `VERSION` / `APP_TITLE` constants (see Versioning above). Zero deps.
- **`main.js`** — the only stateful module. Holds
  `state = { tasks, subcats, editingId, expandedNotes, selectedDate, calYear, calMonth, prefs }`,
  wires DOM events, and is the single place that calls `commit()` (persist tasks + re-render)
  and `setPrefs()` (persist prefs + re-render). New state-changing code goes through
  these, not ad-hoc save/render. Exceptions: display-list notes save quietly (no re-render,
  to keep textarea focus) then `render()` on blur; `topUpSeries` runs once in `init()`. `selectedDate` (the day/week/month anchor) and the
  calendar's shown month are **not persisted** — every load starts at today.
  `periodTasks()` = current-view slice (day/week/month); `shapeTasks()` =
  `visibleTasks(sortTasks(...))`; `currentlyShownTasks()` = `shapeTasks(periodTasks())`,
  the flat display order used by keyboard reorder. `goToDate()` moves the anchor and
  syncs the calendar month; `stepPeriod()` steps by day/week/month. The `#calendar`
  click handler takes `[data-week]` (week view) or `[data-date]` (day/month view) and
  both route through `goToDate()`.

## Conventions

- List interactions use one set of delegated listeners on `#task-list`
  (`click`, `dblclick`, `keydown`); row identity via `closest("li[data-id]")`.
  No per-row listeners.
- Manual reordering (drag, or `ArrowUp`/`ArrowDown` on the drag handle) only works
  when `sort === "manual"`; other sort modes disable the handle. Keyboard reorder
  finds the neighbor in `currentlyShownTasks()` (not the global array) and swaps
  array position via `reorderTask` — in the flat week/month list this reorders
  across dates freely; a task's `date` never changes, only its list position.
- CSS: `src/styles/theme.css` (design tokens + light/dark palettes + reset),
  `src/styles/components.css` (everything else), `src/styles/settings.css` (both
  dialogs incl. history — imported by `settings.js`). All inlined by the build.
  Category colors are `:root` variables (`--cat-<name>-bg/-fg`) applied via
  `[data-category="…"]`; dark theme redefines only the tokens. `[hidden]` does NOT
  auto-`display:none` here (no such reset) — any element with a `display` rule needs
  an explicit `.foo[hidden]{display:none}` (see `.active-filter`, `.composer__subcategory`).
- Progress and the category-tree counts are computed over the **current view**
  (period-scoped list), independent of the active filter / hide-completed within it.
- New tasks are created with `state.selectedDate` (the day being viewed), not
  necessarily today, and with `scope = state.prefs.view` — adding in week view makes a
  week plan, month view a month plan. `shapeTasks()` floats week/month plans to the top
  of the week/month list (`SCOPE_RANK`, stable so the sort mode still orders within each
  group); keyboard reorder won't cross a plan↔day boundary.
- Tests live in `tests/*.test.js`. Pure logic → node env; DOM → `// @vitest-environment jsdom`.
