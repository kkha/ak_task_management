"use strict";

const BACKUP_CONFIG_KEY = "task-app.backup-config";
const BACKUP_DIR_HANDLE_KEY = "task-app.backup-dir-handle";

/** 자동 백업 설정 로드. */
export function loadBackupConfig() {
  try {
    const raw = localStorage.getItem(BACKUP_CONFIG_KEY);
    return raw
      ? JSON.parse(raw)
      : {
          enabled: false,
          dayOfWeek: 0,
          hour: 2,
          minute: 0,
          fileName: "task-backup.json",
          folderName: "다운로드 폴더 (기본값)",
        };
  } catch {
    return {
      enabled: false,
      dayOfWeek: 0,
      hour: 2,
      minute: 0,
      fileName: "task-backup.json",
      folderName: "다운로드 폴더 (기본값)",
    };
  }
}

/** 폴더 핸들을 window에 저장하고 권한 요청. */
export async function saveDirHandle(handle) {
  try {
    // 쓰기 권한 요청
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      window.__backupDirHandle = handle;
      console.info('백업 폴더 권한 획득:', handle.name);
      return true;
    } else {
      console.warn('백업 폴더 쓰기 권한 거부됨');
      return false;
    }
  } catch (err) {
    console.error('폴더 핸들 저장 실패:', err);
    return false;
  }
}

/** 저장된 폴더 핸들 가져오기 */
export function getDirHandle() {
  return window.__backupDirHandle || null;
}

/** 자동 백업 설정 저장. */
export function saveBackupConfig(config) {
  localStorage.setItem(BACKUP_CONFIG_KEY, JSON.stringify(config));
}

/** 현재 시간이 백업 스케줄과 일치하는지 확인. @returns {boolean} */
export function isBackupTime(config) {
  if (!config.enabled) return false;
  const now = new Date();
  return (
    now.getHours() === config.hour &&
    now.getMinutes() === config.minute
  );
}

/** 백업 UI 초기화. */
export function initBackupPanel({
  bodyEl,
  getConfig,
  setConfig,
  onExport,
  onSaveBackup,
}) {
  bodyEl.replaceChildren();

  const config = loadBackupConfig();
  let selectedFolderName = config.folderName || "다운로드 폴더 (기본값)";

  const form = document.createElement("form");
  form.className = "backup-form";

  // 활성화 체크박스
  const enableLabel = document.createElement("label");
  enableLabel.className = "toggle";
  const enableCheck = document.createElement("input");
  enableCheck.type = "checkbox";
  enableCheck.checked = config.enabled;
  enableLabel.append(enableCheck);
  const enableText = document.createElement("span");
  enableText.textContent = "자동 백업 활성화";
  enableLabel.append(enableText);
  form.append(enableLabel);

  // 저장 폴더 선택
  const folderDiv = document.createElement("div");
  folderDiv.className = "backup-row";
  const folderLabel = document.createElement("label");
  folderLabel.className = "field";
  const folderSpan = document.createElement("span");
  folderSpan.textContent = "저장 폴더";
  folderLabel.append(folderSpan);
  const folderDisplay = document.createElement("span");
  folderDisplay.className = "backup-folder-display";
  folderDisplay.textContent = selectedFolderName;
  folderLabel.append(folderDisplay);
  const folderBtn = document.createElement("button");
  folderBtn.type = "button";
  folderBtn.className = "primary-btn backup-btn-small";
  folderBtn.textContent = "폴더 선택";
  folderBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const dirHandle = await window.showDirectoryPicker();
      selectedFolderName = dirHandle.name || "선택됨";
      folderDisplay.textContent = selectedFolderName;
      folderDisplay.title = "폴더가 선택되었습니다.";
      const saved = await saveDirHandle(dirHandle);
      if (!saved) {
        alert("폴더에 대한 쓰기 권한이 필요합니다. 브라우저에서 권한을 허가해주세요.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        alert("폴더 선택 실패. 모던 브라우저를 사용해주세요.");
      }
    }
  });
  folderDiv.append(folderLabel, folderBtn);
  form.append(folderDiv);

  // 매일 백업 설정 (요일 선택 제거)

  // 시간:분 선택
  const timeDiv = document.createElement("div");
  timeDiv.className = "backup-row";
  const timeLabel = document.createElement("label");
  timeLabel.className = "field";
  const timeSpan = document.createElement("span");
  timeSpan.textContent = "시간";
  timeLabel.append(timeSpan);

  const hourSelect = document.createElement("select");
  for (let i = 0; i < 24; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = String(i).padStart(2, "0");
    if (i === config.hour) opt.selected = true;
    hourSelect.append(opt);
  }
  timeLabel.append(hourSelect);

  const colonSpan = document.createElement("span");
  colonSpan.textContent = ":";
  colonSpan.style.margin = "0 0.3rem";
  timeDiv.append(timeLabel, colonSpan);

  const minSelect = document.createElement("select");
  for (let i = 0; i < 60; i += 5) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = String(i).padStart(2, "0");
    if (i === config.minute) opt.selected = true;
    minSelect.append(opt);
  }
  timeDiv.append(minSelect);
  form.append(timeDiv);

  // 파일명 설정
  const fileNameDiv = document.createElement("div");
  fileNameDiv.className = "backup-row";
  const fileNameLabel = document.createElement("label");
  fileNameLabel.className = "field";
  const fileNameSpan = document.createElement("span");
  fileNameSpan.textContent = "파일명";
  fileNameLabel.append(fileNameSpan);
  const fileNameInput = document.createElement("input");
  fileNameInput.type = "text";
  fileNameInput.value = config.fileName || "task-backup.json";
  fileNameInput.placeholder = "task-backup.json";
  fileNameInput.setAttribute("aria-label", "백업 파일명");
  fileNameLabel.append(fileNameInput);
  fileNameDiv.append(fileNameLabel);
  form.append(fileNameDiv);

  // 현재 설정 표시
  const infoDiv = document.createElement("div");
  infoDiv.className = "backup-info";
  const infoText = document.createElement("p");
  const fileName = config.fileName || "task-backup.json";
  if (config.enabled) {
    infoText.textContent = `⏰ 매일 ${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}에 ${fileName} 파일로 자동 백업됩니다.`;
  } else {
    infoText.textContent = "⏸️ 자동 백업이 비활성화되어 있습니다.";
  }
  infoDiv.append(infoText);
  form.append(infoDiv);

  // 저장 버튼
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary-btn";
  saveBtn.textContent = "설정 저장";
  saveBtn.addEventListener("click", () => {
    const newConfig = {
      enabled: enableCheck.checked,
      dayOfWeek: 0,
      hour: parseInt(hourSelect.value),
      minute: parseInt(minSelect.value),
      fileName: fileNameInput.value.trim() || "task-backup.json",
      folderName: selectedFolderName,
    };
    saveBackupConfig(newConfig);
    if (onSaveBackup) onSaveBackup();
    initBackupPanel({ bodyEl, getConfig, setConfig, onExport, onSaveBackup });
  });
  form.append(saveBtn);

  bodyEl.append(form);
}
