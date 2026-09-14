"use strict";

/* ──────────────────────────────────────────────────────────────
 * 목록 드래그 앤 드롭 순서 변경. HTML5 Drag and Drop API 사용.
 * 이벤트는 목록 컨테이너에 위임한다(행이 매번 새로 그려지므로).
 * ────────────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} listEl
 * @param {(fromId: string, toId: string, place: "before"|"after") => void} onReorder
 */
export function attachDnd(listEl, onReorder) {
  let draggingId = null;

  const clearMarkers = () => {
    for (const el of listEl.querySelectorAll(
      ".task--drag-over-before, .task--drag-over-after"
    )) {
      el.classList.remove("task--drag-over-before", "task--drag-over-after");
    }
  };

  listEl.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li || !li.draggable) return;
    draggingId = li.dataset.id;
    li.classList.add("task--dragging");
    e.dataTransfer.effectAllowed = "move";
    // Firefox는 setData가 있어야 드래그가 시작된다.
    try {
      e.dataTransfer.setData("text/plain", draggingId);
    } catch {
      /* 무시 */
    }
  });

  listEl.addEventListener("dragover", (e) => {
    if (draggingId === null) return;
    const li = e.target.closest("li[data-id]");
    if (!li || li.dataset.id === draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = li.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    clearMarkers();
    li.classList.add(
      after ? "task--drag-over-after" : "task--drag-over-before"
    );
  });

  listEl.addEventListener("drop", (e) => {
    if (draggingId === null) return;
    const li = e.target.closest("li[data-id]");
    if (!li || li.dataset.id === draggingId) {
      cleanup();
      return;
    }
    e.preventDefault();
    const place = li.classList.contains("task--drag-over-after")
      ? "after"
      : "before";
    const fromId = draggingId;
    const toId = li.dataset.id;
    cleanup();
    onReorder(fromId, toId, place);
  });

  listEl.addEventListener("dragend", cleanup);

  function cleanup() {
    draggingId = null;
    clearMarkers();
    for (const el of listEl.querySelectorAll(".task--dragging")) {
      el.classList.remove("task--dragging");
    }
  }
}
