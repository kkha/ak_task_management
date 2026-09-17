"use strict";

/**
 * 앱 버전 (유의적 버전). 브라우저 탭·앱 제목에 "AK Task Management v4.0.0"로 표시된다.
 *
 * ⚠️ `package.json`의 `version`과 반드시 일치시킬 것 —
 *    `tests/version.test.js`가 두 값이 같은지 검사한다.
 *    변경 이력은 `CHANGELOG.md`에 남긴다.
 */
export const VERSION = "4.5.0";

/** 표시용: "Task Management v3.3.0" */
export const APP_TITLE = `Task Management v${VERSION}`;
