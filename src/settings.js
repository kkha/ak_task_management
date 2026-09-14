"use strict";

import "./styles/settings.css";
import { CATEGORIES } from "./tasks.js";
import { KEYWORDS, addKeyword, removeKeyword } from "./classify.js";
import {
  subcatsOf,
  childrenOf,
  addSubcat,
  removeSubcat,
  renameSubcat,
} from "./subcats.js";
import { initBackupPanel } from "./backup.js";

/** 통합 설정 다이얼로그 초기화. */
export function initSettingsPanel({
  dialog,
  openBtn,
  getConfig,
  setConfig,
  getSubcats,
  setSubcats,
  onExport,
  onImport,
  onSaveBackup,
}) {
  const tabs = dialog.querySelectorAll(".settings__tab");
  const panels = {
    classify: dialog.querySelector("#classify-panel"),
    subcat: dialog.querySelector("#subcat-panel"),
    backup: dialog.querySelector("#backup-panel"),
    "import-export": dialog.querySelector("#import-export-panel"),
  };

  let classifyShowBuiltin = false;

  function switchTab(tabName) {
    tabs.forEach((t) => {
      t.classList.toggle("is-active", t.dataset.tab === tabName);
    });
    Object.entries(panels).forEach(([name, panel]) => {
      panel.classList.toggle("is-active", name === tabName);
    });

    if (tabName === "classify") renderClassifyPanel();
    else if (tabName === "subcat") renderSubcatPanel();
    else if (tabName === "backup") renderBackupPanel();
    else if (tabName === "import-export") renderImportExportPanel();
  }

  function chip(label, { removable, cat, kw, tone }) {
    const el = document.createElement("span");
    el.className = "kw" + (tone ? ` kw--${tone}` : "");
    const text = document.createElement("span");
    text.textContent = label;
    el.append(text);
    if (removable) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kw__x";
      btn.textContent = "×";
      btn.setAttribute("aria-label", `${cat} 키워드 '${kw}' 삭제`);
      btn.addEventListener("click", () => {
        setConfig(removeKeyword(getConfig(), cat, kw));
        renderClassifyPanel();
      });
      el.append(btn);
    }
    return el;
  }

  function renderClassifyPanel() {
    const bodyEl = panels.classify.querySelector(".settings__body");
    bodyEl.replaceChildren();

    for (const cat of CATEGORIES) {
      const cfg = getConfig();
      const custom = cfg.custom?.[cat] ?? [];
      const learned = cfg.learned?.[cat] ?? [];
      const builtin = KEYWORDS[cat] ?? [];

      const section = document.createElement("section");
      section.className = "kwcat";

      const h = document.createElement("h3");
      h.className = "kwcat__title";
      h.textContent = cat;
      const count = document.createElement("span");
      count.className = "kwcat__count";
      count.textContent = `${builtin.length + custom.length + learned.length}개`;
      h.append(count);
      section.append(h);

      const chips = document.createElement("div");
      chips.className = "kwcat__chips";
      for (const kw of learned) {
        chips.append(chip(kw, { removable: true, cat, kw, tone: "learned" }));
      }
      for (const kw of custom) {
        chips.append(chip(kw, { removable: true, cat, kw, tone: "custom" }));
      }
      if (learned.length === 0 && custom.length === 0) {
        const empty = document.createElement("span");
        empty.className = "kwcat__empty";
        empty.textContent = "추가·학습된 키워드 없음";
        chips.append(empty);
      }
      if (classifyShowBuiltin) {
        for (const kw of builtin) {
          chips.append(chip(kw, { removable: false, tone: "builtin" }));
        }
      }
      section.append(chips);

      const form = document.createElement("form");
      form.className = "kwcat__add";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `${cat} 키워드 추가`;
      input.setAttribute("aria-label", `${cat} 키워드 추가`);
      input.autocomplete = "off";
      const add = document.createElement("button");
      add.type = "submit";
      add.className = "primary-btn";
      add.textContent = "추가";
      form.append(input, add);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        const { config, added } = addKeyword(getConfig(), cat, value);
        if (added.length) {
          setConfig(config);
          input.value = "";
          renderClassifyPanel();
        } else {
          input.select();
        }
      });
      section.append(form);
      bodyEl.append(section);
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ghost-btn";
    toggle.textContent = classifyShowBuiltin
      ? "내장 키워드 숨기기"
      : "내장 키워드 보기";
    toggle.addEventListener("click", () => {
      classifyShowBuiltin = !classifyShowBuiltin;
      renderClassifyPanel();
    });
    bodyEl.append(toggle);

    const resetBtn = dialog.querySelector("#settings-reset");
    resetBtn.addEventListener("click", () => {
      if (
        !window.confirm(
          "사용자가 추가·학습한 키워드를 모두 지울까요? (내장 키워드는 유지)"
        )
      ) {
        return;
      }
      setConfig({ custom: {}, learned: {} });
      renderClassifyPanel();
    });
  }

  function renderSubcatPanel() {
    const bodyEl = panels.subcat.querySelector(".settings__body");
    bodyEl.replaceChildren();

    for (const cat of CATEGORIES) {
      if (cat === "업무") {
        bodyEl.append(renderSubcatNested(cat));
      } else {
        bodyEl.append(renderSubcatFlat(cat));
      }
    }
  }

  function renderSubcatFlat(cat) {
    const list = subcatsOf(getSubcats(), cat);
    const sec = document.createElement("section");
    sec.className = "kwcat";

    const h = document.createElement("h3");
    h.className = "kwcat__title";
    h.textContent = cat;
    const count = document.createElement("span");
    count.className = "kwcat__count";
    count.textContent = `${list.length}개`;
    h.append(count);
    sec.append(h);

    const chips = document.createElement("div");
    chips.className = "kwcat__chips";
    if (list.length === 0) {
      const empty = document.createElement("span");
      empty.className = "kwcat__empty";
      empty.textContent = "세부분류 없음";
      chips.append(empty);
    }
    for (const name of list) {
      const el = document.createElement("span");
      el.className = "kw kw--custom";
      const text = document.createElement("span");
      text.textContent = name;
      el.append(text);

      const ren = document.createElement("button");
      ren.type = "button";
      ren.className = "kw__x";
      ren.textContent = "✎";
      ren.setAttribute("aria-label", `${cat} '${name}' 이름 변경`);
      ren.addEventListener("click", () => {
        const to = window.prompt(`'${name}' → 새 이름`, name);
        if (to === null) return;
        const { map, renamed } = renameSubcat(getSubcats(), cat, name, to);
        if (renamed) {
          setSubcats(map);
          renderSubcatPanel();
        }
      });
      el.append(ren);

      const x = document.createElement("button");
      x.type = "button";
      x.className = "kw__x";
      x.textContent = "×";
      x.setAttribute("aria-label", `${cat} '${name}' 삭제`);
      x.addEventListener("click", () => {
        setSubcats(removeSubcat(getSubcats(), cat, name));
        renderSubcatPanel();
      });
      el.append(x);
      chips.append(el);
    }
    sec.append(chips);

    const form = document.createElement("form");
    form.className = "kwcat__add";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `${cat} 세부분류 추가`;
    input.setAttribute("aria-label", `${cat} 세부분류 추가`);
    input.autocomplete = "off";
    const add = document.createElement("button");
    add.type = "submit";
    add.className = "primary-btn";
    add.textContent = "추가";
    form.append(input, add);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const { map, added } = addSubcat(getSubcats(), cat, value);
      if (added) {
        setSubcats(map);
        input.value = "";
        renderSubcatPanel();
      } else {
        input.select();
      }
    });
    sec.append(form);
    return sec;
  }

  function renderSubcatNested(cat) {
    const parents = subcatsOf(getSubcats(), cat);
    const sec = document.createElement("section");
    sec.className = "kwcat";

    const h = document.createElement("h3");
    h.className = "kwcat__title";
    h.textContent = cat;
    const count = document.createElement("span");
    count.className = "kwcat__count";
    count.textContent = `${parents.length}개`;
    h.append(count);
    sec.append(h);

    const container = document.createElement("div");
    container.className = "kwcat__tree";
    if (parents.length === 0) {
      const empty = document.createElement("span");
      empty.className = "kwcat__empty";
      empty.textContent = "세부분류 없음";
      container.append(empty);
    }

    for (const parent of parents) {
      const parentEl = document.createElement("div");
      parentEl.className = "kwcat__parent";

      const parentHeader = document.createElement("div");
      parentHeader.className = "kwcat__parent-header";

      const parentText = document.createElement("span");
      parentText.className = "kwcat__parent-text";
      parentText.textContent = parent;

      const parentRen = document.createElement("button");
      parentRen.type = "button";
      parentRen.className = "kw__x";
      parentRen.textContent = "✎";
      parentRen.setAttribute("aria-label", `${cat} '${parent}' 이름 변경`);
      parentRen.addEventListener("click", () => {
        const to = window.prompt(`'${parent}' → 새 이름`, parent);
        if (to === null) return;
        const { map, renamed } = renameSubcat(getSubcats(), cat, parent, to);
        if (renamed) {
          setSubcats(map);
          renderSubcatPanel();
        }
      });

      const parentDel = document.createElement("button");
      parentDel.type = "button";
      parentDel.className = "kw__x";
      parentDel.textContent = "×";
      parentDel.setAttribute("aria-label", `${cat} '${parent}' 삭제`);
      parentDel.addEventListener("click", () => {
        setSubcats(removeSubcat(getSubcats(), cat, parent));
        renderSubcatPanel();
      });

      parentHeader.append(parentText, parentRen, parentDel);
      parentEl.append(parentHeader);

      const children = childrenOf(getSubcats(), parent);
      const childrenEl = document.createElement("div");
      childrenEl.className = "kwcat__children";

      for (const child of children) {
        const childEl = document.createElement("span");
        childEl.className = "kw kw--custom kwcat__child";
        const childText = document.createElement("span");
        childText.textContent = child;
        childEl.append(childText);

        const childRen = document.createElement("button");
        childRen.type = "button";
        childRen.className = "kw__x";
        childRen.textContent = "✎";
        childRen.setAttribute(
          "aria-label",
          `${cat} '${parent}' 아래 '${child}' 이름 변경`
        );
        childRen.addEventListener("click", () => {
          const to = window.prompt(`'${child}' → 새 이름`, child);
          if (to === null) return;
          const { map, renamed } = renameSubcat(
            getSubcats(),
            cat,
            child,
            to,
            parent
          );
          if (renamed) {
            setSubcats(map);
            renderSubcatPanel();
          }
        });
        childEl.append(childRen);

        const childDel = document.createElement("button");
        childDel.type = "button";
        childDel.className = "kw__x";
        childDel.textContent = "×";
        childDel.setAttribute(
          "aria-label",
          `${cat} '${parent}' 아래 '${child}' 삭제`
        );
        childDel.addEventListener("click", () => {
          setSubcats(removeSubcat(getSubcats(), cat, child, parent));
          renderSubcatPanel();
        });
        childEl.append(childDel);
        childrenEl.append(childEl);
      }

      const childForm = document.createElement("form");
      childForm.className = "kwcat__add";
      const childInput = document.createElement("input");
      childInput.type = "text";
      childInput.placeholder = `${parent} 아래 세부분류 추가`;
      childInput.setAttribute(
        "aria-label",
        `${parent} 아래 세부분류 추가`
      );
      childInput.autocomplete = "off";
      const childAdd = document.createElement("button");
      childAdd.type = "submit";
      childAdd.className = "primary-btn";
      childAdd.textContent = "추가";
      childForm.append(childInput, childAdd);
      childForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = childInput.value.trim();
        if (!value) return;
        const { map, added } = addSubcat(getSubcats(), cat, value, parent);
        if (added) {
          setSubcats(map);
          childInput.value = "";
          renderSubcatPanel();
        } else {
          childInput.select();
        }
      });

      childrenEl.append(childForm);
      parentEl.append(childrenEl);
      container.append(parentEl);
    }

    const parentForm = document.createElement("form");
    parentForm.className = "kwcat__add";
    const parentInput = document.createElement("input");
    parentInput.type = "text";
    parentInput.placeholder = "새 분류 추가 (예: 빅데이터)";
    parentInput.setAttribute("aria-label", "새 분류 추가");
    parentInput.autocomplete = "off";
    const parentAdd = document.createElement("button");
    parentAdd.type = "submit";
    parentAdd.className = "primary-btn";
    parentAdd.textContent = "추가";
    parentForm.append(parentInput, parentAdd);
    parentForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = parentInput.value.trim();
      if (!value) return;
      const { map, added } = addSubcat(getSubcats(), cat, value);
      if (added) {
        setSubcats(map);
        parentInput.value = "";
        renderSubcatPanel();
      } else {
        parentInput.select();
      }
    });
    container.append(parentForm);
    sec.append(container);
    return sec;
  }

  function renderBackupPanel() {
    const bodyEl = panels.backup.querySelector(".settings__body");
    initBackupPanel({
      bodyEl,
      getConfig,
      setConfig,
      onExport,
      onSaveBackup,
    });
  }

  function renderImportExportPanel() {
    const exportBtn = panels["import-export"].querySelector("#export-now-btn");
    const importBtn = panels["import-export"].querySelector("#import-now-btn");
    const importFile = dialog.querySelector("#import-file");

    exportBtn.addEventListener("click", onExport);
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", (e) => {
      if (e.target.files[0]) {
        onImport(e.target.files[0]);
        e.target.value = "";
      }
    });
  }

  // 탭 클릭 처리
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // 설정 버튼 클릭
  openBtn.addEventListener("click", () => {
    switchTab("classify");
    dialog.showModal();
  });

  // 배경 클릭으로 닫기
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

/* ──────────────────────────────────────────────────────────────
 * 하위 호환성: 기존 함수들 (main.js에서 사용)
 * ────────────────────────────────────────────────────────────── */

export function initSettings({
  dialog,
  openBtn,
  resetBtn,
  bodyEl,
  getConfig,
  setConfig,
}) {
  // 통합 설정으로 이동 (하위호환성만 유지)
}

export function initSubcatEditor({ dialog, openBtn, bodyEl, getMap, setMap }) {
  // 통합 설정으로 이동 (하위호환성만 유지)
}
