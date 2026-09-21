"use strict";

import "./styles/settings.css";
import { CATEGORIES } from "./tasks.js";

// tree-shaking 방지: 모듈 로드 확인용 플래그
if (typeof window !== "undefined") window._settingsLoaded = true;
import { KEYWORDS, addKeyword, removeKeyword } from "./classify.js";
import {
  subcatsOf,
  childrenOf,
  addSubcat,
  removeSubcat,
  renameSubcat,
} from "./subcats.js";
import { initBackupPanel } from "./backup.js";

/** 세부분류 이름 변경 후 기존 할 일들의 subcategory를 마이그레이션한다. */
function migrateTasksAfterSubcatRename(getTasks, setTasks, cat, fromName, toName, parentName) {
  if (!getTasks || !setTasks) return;
  const tasks = getTasks();
  let migrated = false;
  const updated = tasks.map((task) => {
    if (task.category !== cat || !task.subcategory) return task;

    // 개인/공부: 직접 비교
    if (cat !== "업무") {
      if (task.subcategory === fromName) {
        migrated = true;
        return { ...task, subcategory: toName };
      }
      return task;
    }

    // 업무: parentName이 있으면 부모 아래 자식 이름 변경, 없으면 부모 이름 변경
    if (parentName) {
      const i = task.subcategory.indexOf("/");
      if (i !== -1) {
        const parent = task.subcategory.slice(0, i);
        const child = task.subcategory.slice(i + 1);
        if (parent === parentName && child === fromName) {
          migrated = true;
          return { ...task, subcategory: `${parent}/${toName}` };
        }
      }
    } else {
      const i = task.subcategory.indexOf("/");
      if (i !== -1) {
        const parent = task.subcategory.slice(0, i);
        if (parent === fromName) {
          const child = task.subcategory.slice(i + 1);
          migrated = true;
          return { ...task, subcategory: `${toName}/${child}` };
        }
      }
    }
    return task;
  });

  if (migrated) {
    setTasks(updated);
  }
}

/** 통합 설정 다이얼로그 초기화. */
export function initSettingsPanel({
  dialog,
  openBtn,
  getConfig,
  setConfig,
  getSubcats,
  setSubcats,
  getTasks,
  setTasks,
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
      el.dataset.name = name;

      const text = document.createElement("span");
      text.textContent = name;
      el.append(text);

      // 위로 이동 버튼 (▲)
      const up = document.createElement("button");
      up.type = "button";
      up.className = "kw__x";
      up.textContent = "▲";
      up.setAttribute("aria-label", `${cat} '${name}' 위로 이동`);
      if (list.indexOf(name) === 0) {
        up.disabled = true;
        up.style.opacity = "0.3";
        up.style.cursor = "not-allowed";
      }
      up.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = list.indexOf(name);
        if (idx <= 0) return;
        const nextList = [...list];
        [nextList[idx - 1], nextList[idx]] = [nextList[idx], nextList[idx - 1]];
        setSubcats({ ...getSubcats(), [cat]: nextList });
        renderSubcatPanel();
      });
      el.append(up);

      // 아래로 이동 버튼 (▼)
      const down = document.createElement("button");
      down.type = "button";
      down.className = "kw__x";
      down.textContent = "▼";
      down.setAttribute("aria-label", `${cat} '${name}' 아래로 이동`);
      if (list.indexOf(name) === list.length - 1) {
        down.disabled = true;
        down.style.opacity = "0.3";
        down.style.cursor = "not-allowed";
      }
      down.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = list.indexOf(name);
        if (idx === -1 || idx >= list.length - 1) return;
        const nextList = [...list];
        [nextList[idx + 1], nextList[idx]] = [nextList[idx], nextList[idx + 1]];
        setSubcats({ ...getSubcats(), [cat]: nextList });
        renderSubcatPanel();
      });
      el.append(down);

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
          // 기존 할 일들의 subcategory도 함께 업데이트
          migrateTasksAfterSubcatRename(getTasks, setTasks, cat, name, to, null);
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
        // 세부분류 삭제 전에 할 일 마이그레이션 (미분류로 이동)
        const tasks = getTasks();
        console.log(`🔍 삭제 시작: ${cat} > ${name}, tasks: ${tasks.length}`);
        let migrated = false;
        const updated = tasks.map((task) => {
          if (task.category !== cat || !task.subcategory) return task;
          // 개인/공부 또는 단순 세부분류 비교
          if (cat !== "업무") {
            if (task.subcategory === name) {
              console.log(`🔧 마이그레이션: "${task.text}" → 미분류`);
              migrated = true;
              return { ...task, subcategory: undefined };
            }
          } else {
            // 업무: "parent/child" 형태 확인
            const i = task.subcategory.indexOf("/");
            if (i !== -1) {
              const parent = task.subcategory.slice(0, i);
              if (parent === name) {
                console.log(`🔧 마이그레이션 (부모): "${task.text}" → 미분류`);
                migrated = true;
                return { ...task, subcategory: undefined };
              }
            } else if (task.subcategory === name) {
              console.log(`🔧 마이그레이션 (단순): "${task.text}" → 미분류`);
              migrated = true;
              return { ...task, subcategory: undefined };
            }
          }
          return task;
        });
        console.log(`✅ migrated: ${migrated}, updated: ${updated.length}`);
        if (migrated) {
          console.log('📝 setTasks 호출');
          setTasks(updated);
        }

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
      parentEl.dataset.parent = parent;

      const parentHeader = document.createElement("div");
      parentHeader.className = "kwcat__parent-header";

      const parentText = document.createElement("span");
      parentText.className = "kwcat__parent-text";
      parentText.textContent = parent;
      parentHeader.append(parentText);

      // 대분류 위로 이동 버튼 (▲)
      const parentUp = document.createElement("button");
      parentUp.type = "button";
      parentUp.className = "kw__x";
      parentUp.textContent = "▲";
      parentUp.setAttribute("aria-label", `${cat} '${parent}' 위로 이동`);
      if (parents.indexOf(parent) === 0) {
        parentUp.disabled = true;
        parentUp.style.opacity = "0.3";
        parentUp.style.cursor = "not-allowed";
      }
      parentUp.addEventListener("click", () => {
        const idx = parents.indexOf(parent);
        if (idx <= 0) return;
        const nextParents = [...parents];
        [nextParents[idx - 1], nextParents[idx]] = [nextParents[idx], nextParents[idx - 1]];

        const currentSubcats = getSubcats();
        const nextWumup = {};
        const originalWumup = currentSubcats.업무 || {};
        for (const p of nextParents) {
          nextWumup[p] = originalWumup[p] || [];
        }
        setSubcats({ ...currentSubcats, [cat]: nextWumup });
        renderSubcatPanel();
      });
      parentHeader.append(parentUp);

      // 대분류 아래로 이동 버튼 (▼)
      const parentDown = document.createElement("button");
      parentDown.type = "button";
      parentDown.className = "kw__x";
      parentDown.textContent = "▼";
      parentDown.setAttribute("aria-label", `${cat} '${parent}' 아래로 이동`);
      if (parents.indexOf(parent) === parents.length - 1) {
        parentDown.disabled = true;
        parentDown.style.opacity = "0.3";
        parentDown.style.cursor = "not-allowed";
      }
      parentDown.addEventListener("click", () => {
        const idx = parents.indexOf(parent);
        if (idx === -1 || idx >= parents.length - 1) return;
        const nextParents = [...parents];
        [nextParents[idx + 1], nextParents[idx]] = [nextParents[idx], nextParents[idx + 1]];

        const currentSubcats = getSubcats();
        const nextWumup = {};
        const originalWumup = currentSubcats.업무 || {};
        for (const p of nextParents) {
          nextWumup[p] = originalWumup[p] || [];
        }
        setSubcats({ ...currentSubcats, [cat]: nextWumup });
        renderSubcatPanel();
      });
      parentHeader.append(parentDown);

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
          // 기존 할 일들의 subcategory도 함께 업데이트
          migrateTasksAfterSubcatRename(getTasks, setTasks, cat, parent, to, null);
          renderSubcatPanel();
        }
      });
      parentHeader.append(parentRen);

      const parentDel = document.createElement("button");
      parentDel.type = "button";
      parentDel.className = "kw__x";
      parentDel.textContent = "×";
      parentDel.setAttribute("aria-label", `${cat} '${parent}' 삭제`);
      parentDel.addEventListener("click", () => {
        setSubcats(removeSubcat(getSubcats(), cat, parent));
        renderSubcatPanel();
      });
      parentHeader.append(parentDel);
      parentEl.append(parentHeader);

      const children = childrenOf(getSubcats(), parent);
      const childrenEl = document.createElement("div");
      childrenEl.className = "kwcat__children";

      for (const child of children) {
        const childEl = document.createElement("span");
        childEl.className = "kw kw--custom kwcat__child";
        childEl.dataset.child = child;
        childEl.dataset.parent = parent;

        const childText = document.createElement("span");
        childText.textContent = child;
        childEl.append(childText);

        // 소분류 위로 이동 버튼 (▲)
        const childUp = document.createElement("button");
        childUp.type = "button";
        childUp.className = "kw__x";
        childUp.textContent = "▲";
        childUp.setAttribute("aria-label", `${cat} '${parent}' 아래 '${child}' 위로 이동`);
        if (children.indexOf(child) === 0) {
          childUp.disabled = true;
          childUp.style.opacity = "0.3";
          childUp.style.cursor = "not-allowed";
        }
        childUp.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = children.indexOf(child);
          if (idx <= 0) return;
          const nextChildren = [...children];
          [nextChildren[idx - 1], nextChildren[idx]] = [nextChildren[idx], nextChildren[idx - 1]];

          const currentSubcats = getSubcats();
          const nextWumup = { ...currentSubcats.업무, [parent]: nextChildren };
          setSubcats({ ...currentSubcats, [cat]: nextWumup });
          renderSubcatPanel();
        });
        childEl.append(childUp);

        // 소분류 아래로 이동 버튼 (▼)
        const childDown = document.createElement("button");
        childDown.type = "button";
        childDown.className = "kw__x";
        childDown.textContent = "▼";
        childDown.setAttribute("aria-label", `${cat} '${parent}' 아래 '${child}' 아래로 이동`);
        if (children.indexOf(child) === children.length - 1) {
          childDown.disabled = true;
          childDown.style.opacity = "0.3";
          childDown.style.cursor = "not-allowed";
        }
        childDown.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = children.indexOf(child);
          if (idx === -1 || idx >= children.length - 1) return;
          const nextChildren = [...children];
          [nextChildren[idx + 1], nextChildren[idx]] = [nextChildren[idx], nextChildren[idx + 1]];

          const currentSubcats = getSubcats();
          const nextWumup = { ...currentSubcats.업무, [parent]: nextChildren };
          setSubcats({ ...currentSubcats, [cat]: nextWumup });
          renderSubcatPanel();
        });
        childEl.append(childDown);

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
            // 기존 할 일들의 subcategory도 함께 업데이트
            migrateTasksAfterSubcatRename(getTasks, setTasks, cat, child, to, parent);
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
