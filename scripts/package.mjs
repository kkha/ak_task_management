import { execFileSync } from "node:child_process";
import {
  rmSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { VERSION } from "../src/version.js";

/* ──────────────────────────────────────────────────────────────
 * `npm run package` — 회사 PC 등에 그대로 복사해 쓰는 배포본을 만든다.
 *   release/AK Task Management/
 *     ├─ index.html                (CSS·JS 인라인된 단일 파일 — 더블클릭으로 열림)
 *     ├─ app-icon.ico              (전용 앱 아이콘)
 *     ├─ AK Task Management.lnk    (전용 아이콘 바로가기 — 작업표시줄 고정용)
 *     ├─ 바로가기 만들기.cmd        (다른 PC에서 경로 맞는 .lnk 재생성)
 *     ├─ _shortcut.ps1
 *     ├─ 변경이력.txt               (CHANGELOG.md 사본)
 *     └─ 사용법.txt
 *   release/AK-Task-Management.zip  (위 폴더 압축)
 *
 * v4: `.cmd` 앱모드 런처 폐기. index.html 을 그냥 열고(기본 브라우저 일반 탭),
 * 작업표시줄 고정은 explorer.exe 를 대상으로 한 .lnk 로 한다(진짜 실행 파일이라
 * "작업 표시줄에 고정" 메뉴가 뜨고, 브라우저 종류에 의존하지 않는다).
 * ────────────────────────────────────────────────────────────── */

const APP_NAME = "AK Task Management";
const root = process.cwd();
const dist = resolve(root, "dist/index.html");
const iconSrc = resolve(root, "assets/app-icon.ico");
const changelogSrc = resolve(root, "CHANGELOG.md");
const releaseDir = resolve(root, "release");
const appDir = resolve(releaseDir, APP_NAME);

if (!existsSync(dist)) {
  console.error("dist/index.html 이 없습니다. 먼저 `npm run build` 하세요.");
  process.exit(1);
}
if (!existsSync(iconSrc)) {
  console.error("assets/app-icon.ico 가 없습니다. 먼저 `npm run icon` 하세요.");
  process.exit(1);
}

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

copyFileSync(dist, resolve(appDir, "index.html"));
copyFileSync(iconSrc, resolve(appDir, "app-icon.ico"));
if (existsSync(changelogSrc)) {
  copyFileSync(changelogSrc, resolve(appDir, "변경이력.txt"));
}
console.log(`  버전: v${VERSION}`);

const BOM = String.fromCharCode(0xfeff);

/* ── 사용법 ────────────────────────────────────────────────── */
const guide = `${APP_NAME} v${VERSION} — 사용법
${"=".repeat(40)}
(버전별 변경 내용은 "변경이력.txt" 참고)

[실행]
  "index.html" 을 더블클릭하면 기본 브라우저에서 바로 열립니다.
  설치·계정·인터넷 연결 모두 필요 없습니다.

[작업 표시줄에 고정]  ← 매일 여기서 한 번에 켜기
  1. 이 폴더에서 "바로가기 만들기.cmd" 를 한 번 더블클릭하세요.
     이 PC 경로에 맞는 "${APP_NAME}" 바로가기가 이 폴더에 생깁니다.
     (동봉된 바로가기가 이미 잘 열리면 안 해도 됩니다.)
  2. "${APP_NAME}" 바로가기를 우클릭 → "추가 옵션 표시"
     → "작업 표시줄에 고정".
  이후 작업 표시줄의 그 아이콘(체크 표시)을 누르면 앱이 열립니다.

[데이터 저장]
  할 일 · 메모 · 설정 · 히스토리는 모두 이 브라우저·이 PC에 자동 저장됩니다.
  - 다른 PC/브라우저와 동기화되지 않습니다.
  - 옮기거나 백업하려면 앱 우측 위 "내보내기"로 JSON 파일을 만들고,
    새 PC에서 "가져오기" 하세요.

[폴더 이동]
  폴더를 통째로 옮기면 됩니다. 옮긴 뒤 "바로가기 만들기.cmd" 를
  다시 실행해 바로가기 경로를 갱신하세요.

[반복 일정]
  일별 보기에서 "매일 / 평일 / 매주"를 고르고 추가하면 8주치가 만들어지고,
  앱을 열 때마다 8주 앞까지 자동으로 채워집니다.
`;
writeFileSync(resolve(appDir, "사용법.txt"), BOM + guide, "utf8");

/* ── 바로가기 생성기 (대상 PC에서 경로 맞는 .lnk) ────────────────
 * 대상은 explorer.exe(진짜 실행 파일). index.html 을 인수로 넘기면
 * Windows 가 기본 브라우저로 연다. 아이콘은 동봉한 app-icon.ico.        */
const shortcutPs = `$here = $PSScriptRoot
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path $here '${APP_NAME}.lnk'))
$lnk.TargetPath = (Join-Path $env:WINDIR 'explorer.exe')
$lnk.Arguments = '"' + (Join-Path $here 'index.html') + '"'
$lnk.WorkingDirectory = $here
$lnk.IconLocation = (Join-Path $here 'app-icon.ico') + ',0'
$lnk.Description = '${APP_NAME}'
$lnk.Save()
Write-Host ''
Write-Host ('  바로가기 생성: ' + $lnk.FullName)
Write-Host '  우클릭 -> "추가 옵션 표시" -> "작업 표시줄에 고정"'
Write-Host ''
`;
writeFileSync(resolve(appDir, "_shortcut.ps1"), BOM + shortcutPs, "utf8");
writeFileSync(
  resolve(appDir, "바로가기 만들기.cmd"),
  `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_shortcut.ps1"\r\npause\r\n`,
  "utf8"
);

const psQuote = (p) => p.replace(/'/g, "''");
try {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(appDir, "_shortcut.ps1"),
    ],
    { stdio: "ignore" }
  );
  console.log("  ✓ 바로가기(.lnk) 생성 — 아이콘: app-icon.ico");
} catch {
  console.log("  · 바로가기(.lnk)는 건너뜀 — 대상 PC에서 '바로가기 만들기.cmd' 실행");
}

const zip = resolve(releaseDir, "AK-Task-Management.zip");
try {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${psQuote(appDir)}' -DestinationPath '${psQuote(zip)}' -Force`,
    ],
    { stdio: "ignore" }
  );
  console.log("  ✓ zip 생성");
} catch {
  console.log("  · zip 은 건너뜀 (PowerShell 사용 불가)");
}

console.log(`\n배포본: ${appDir}`);
console.log(`압축본: ${zip}`);
