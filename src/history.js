"use strict";

import { historyEntries } from "./tasks.js";
import { WEEKDAY_NAMES, parseISO, isoDateFromMillis } from "./dates.js";

/* ──────────────────────────────────────────────────────────────
 * 완료 히스토리 다이얼로그. 완료된 항목을 검색·기간으로 걸러
 * "언제 · 어떻게 끝났는지" 최근순으로 보여준다. DOM 전용.
 * ────────────────────────────────────────────────────────────── */

function fmtClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDayHeading(iso) {
  const d = parseISO(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAY_NAMES[d.getDay()]})`;
}

/** createdAt → doneAt 소요를 "3일 5시간" 식으로. */
function fmtDuration(fromMs, toMs) {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  if (mins < 60) return `${mins}분`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}시간`;
  const days = Math.floor(hrs / 24);
  const rem = hrs % 24;
  return rem ? `${days}일 ${rem}시간` : `${days}일`;
}

/**
 * @param {{
 *   dialog: HTMLDialogElement, openBtn: HTMLElement,
 *   searchEl: HTMLInputElement, fromEl: HTMLInputElement, toEl: HTMLInputElement,
 *   bodyEl: HTMLElement, getTasks: () => Array,
 * }} opts
 */
export function initHistory({
  dialog,
  openBtn,
  searchEl,
  fromEl,
  toEl,
  bodyEl,
  getTasks,
}) {
  function render() {
    const entries = historyEntries(getTasks(), {
      query: searchEl.value,
      from: fromEl.value || null,
      to: toEl.value || null,
    });
    bodyEl.replaceChildren();

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history__empty";
      empty.textContent = "조건에 맞는 완료 항목이 없습니다.";
      bodyEl.append(empty);
      return;
    }

    const summary = document.createElement("p");
    summary.className = "history__summary";
    summary.textContent = `${entries.length}건`;
    bodyEl.append(summary);

    let lastDay = null;
    let group = null;
    for (const t of entries) {
      const day = isoDateFromMillis(t.doneAt);
      if (day !== lastDay) {
        lastDay = day;
        const h = document.createElement("h3");
        h.className = "history__day";
        h.textContent = fmtDayHeading(day);
        bodyEl.append(h);
        group = document.createElement("ul");
        group.className = "history__list";
        bodyEl.append(group);
      }
      group.append(entryRow(t));
    }
  }

  function entryRow(t) {
    const li = document.createElement("li");
    li.className = "history__item";

    const top = document.createElement("div");
    top.className = "history__top";

    const time = document.createElement("span");
    time.className = "history__time";
    time.textContent = fmtClock(t.doneAt);

    const text = document.createElement("span");
    text.className = "history__text";
    text.textContent = t.text;

    const cat = document.createElement("span");
    cat.className = "history__cat";
    cat.dataset.category = t.category;
    cat.textContent = t.subcategory
      ? `${t.category} · ${t.subcategory}`
      : t.category;

    top.append(time, text, cat);
    li.append(top);

    const meta = document.createElement("div");
    meta.className = "history__meta";
    meta.textContent = `소요 ${fmtDuration(t.createdAt, t.doneAt)}`;
    li.append(meta);

    if (t.notes && t.notes.trim()) {
      const notes = document.createElement("p");
      notes.className = "history__notes";
      notes.textContent = t.notes.trim();
      li.append(notes);
    }
    return li;
  }

  openBtn.addEventListener("click", () => {
    render();
    dialog.showModal();
  });
  for (const el of [searchEl, fromEl, toEl]) {
    el.addEventListener("input", render);
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}
