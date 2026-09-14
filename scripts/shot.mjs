import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const OUT = resolve("scripts/screenshots");
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const APP_URL = pathToFileURL(resolve("dist/index.html")).href;

async function newPage(theme, width = 1440) {
  const page = await browser.newPage({
    viewport: { width, height: 1300 },
    colorScheme: theme,
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(APP_URL);
  await page.waitForSelector("#calendar button[data-date]");
  return page;
}

/** localStorage 에 현실적인 데이터셋을 심고 새로고침한다. */
async function seed(page) {
  await page.evaluate(() => {
    const iso = (o) => {
      const d = new Date(Date.now() + o * 864e5);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    localStorage.setItem(
      "task-app.subcategories",
      JSON.stringify({
        개인: ["운동", "집안일"],
        업무: {
          빅데이터: ["로케이션찾기", "이슈분석"],
          "AI/자동화": [],
          "UT일반": [],
          "UT과제": [],
        },
        공부: ["강의"],
      })
    );
    const T = [];
    let n = 0;
    const add = (o) =>
      T.push({
        id: "s" + n++,
        completed: false,
        createdAt: Date.now() - n * 1000,
        category: "업무",
        date: iso(0),
        ...o,
      });
    add({ text: "거래처 미팅 자료 준비", subcategory: "UT일반", priority: "high", notes: "12시 발표 · 최종본 v3 확인 필요\n프린터 토너 상태 체크" });
    add({ text: "데이터 파이프라인 점검", subcategory: "빅데이터/로케이션찾기", status: "doing" });
    add({ text: "분류 자동화 스크립트", subcategory: "AI/자동화", priority: "low" });
    add({ text: "UT과제 리포트 초안", subcategory: "UT과제" });
    add({ text: "우유 사기", category: "개인", subcategory: "집안일" });
    add({ text: "달리기 30분", category: "개인", subcategory: "운동", completed: true, createdAt: Date.now() - 2 * 3600e3, doneAt: Date.now() - 3600e3, notes: "5.2km · 페이스 6:10" });
    add({ text: "2분기 결산 보고", category: "업무", subcategory: "빅데이터/이슈분석", completed: true, createdAt: Date.now() - 5 * 86400e3, doneAt: Date.now() - 26 * 3600e3 });
    add({ text: "인프런 강의 1챕터", category: "공부", subcategory: "강의", completed: true, createdAt: Date.now() - 3 * 86400e3 - 5400e3, doneAt: Date.now() - 3 * 86400e3 });
    add({ text: "알고리즘 3문제", category: "공부", subcategory: "강의", status: "doing" });
    add({ text: "스탠드업 미팅", subcategory: "UT일반", recurrence: { freq: "weekdays" }, series: "sd" });
    add({ text: "치과 예약", category: "개인", date: iso(1) });
    add({ text: "UT 세션 진행 (2일)", date: iso(0), endDate: iso(1), subcategory: "UT과제", priority: "high" });
    add({ text: "주간 보고서 작성", date: iso(2), subcategory: "UT일반" });
    add({ text: "인프런 강의 2챕터", category: "공부", date: iso(4), subcategory: "강의" });
    add({ text: "4분기 로드맵 정리", scope: "week", subcategory: "빅데이터/로케이션찾기" });
    add({ text: "건강검진 예약", category: "개인", scope: "month" });
    localStorage.setItem("task-app.tasks", JSON.stringify(T));
    localStorage.setItem(
      "task-app.memo",
      "· 김대리 회신 기다리는 중\n· 금요일 회식 장소 예약\n· 프린터 토너 주문"
    );
  });
  await page.reload();
  await page.waitForSelector("#task-list li[data-id]");
  await page.waitForTimeout(200);
}

// 1) 일별 (라이트, 3단)
let page = await newPage("light");
await seed(page);
await page.screenshot({ path: `${OUT}/01-day-light.png`, fullPage: true });
console.log("day label :", JSON.stringify(await page.textContent("#period-label")));
console.log(
  "tree rows :",
  await page.locator("#category-tree button[data-filter]").count()
);

// 2) 편집 카드 + 메모 펼침
await page.click('#task-list li[data-id] .task-edit'); // 첫 항목 편집
await page.waitForTimeout(120);
await page.click('#task-list li:nth-child(2) .task__notes-toggle'); // 다른 항목 메모
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/02-edit-notes.png`, fullPage: true });
await page.click("#task-list .edit-cancel");

// 3) 세부분류 필터 (업무 › 빅데이터 › 로케이션찾기)
await page.click('#category-tree button[data-filter="업무/빅데이터/로케이션찾기"]');
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/03-subcat-filter.png`, fullPage: true });
await page.click("#active-filter");

// 4) 주별 통합 목록
await page.click("#view-week");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/04-week-light.png`, fullPage: true });

// 5) 월별 통합 목록
await page.click("#view-month");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/05-month-light.png`, fullPage: true });
await page.click("#view-day");

// 5b) 히스토리 다이얼로그
await page.click("#history-btn");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/05b-history.png` });
await page.keyboard.press("Escape");

// 6) 다크 테마 (일별)
await page.close();
page = await newPage("dark");
await seed(page);
await page.screenshot({ path: `${OUT}/06-day-dark.png`, fullPage: true });

// 7) 태블릿 폭 — 트리 슬라이드오버
await page.close();
page = await newPage("light", 1000);
await seed(page);
await page.click("#nav-toggle");
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/07-tablet-navopen.png`, fullPage: true });

// 8) 모바일 (스택, 일별)
await page.close();
page = await newPage("light", 390);
await seed(page);
await page.screenshot({ path: `${OUT}/08-mobile-day.png`, fullPage: true });

await browser.close();

console.log(
  "\nconsole/page errors:",
  errors.length ? JSON.stringify(errors, null, 2) : "none"
);
console.log("screenshots ->", OUT);
