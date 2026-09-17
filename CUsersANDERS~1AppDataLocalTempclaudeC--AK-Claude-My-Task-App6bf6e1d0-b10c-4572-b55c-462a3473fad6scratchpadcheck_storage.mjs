import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();

// 로컬 파일 열기
await page.goto('file://C:/AK_Claude/My_Task_App/dist/index.html', {
  waitUntil: 'networkidle2',
});

// localStorage 내용 추출
const storage = await page.evaluate(() => {
  const subcats = localStorage.getItem('task-app.subcategories');
  const tasks = localStorage.getItem('task-app.tasks');
  return {
    subcats: subcats ? JSON.parse(subcats) : null,
    tasks: tasks ? JSON.parse(tasks).slice(0, 3) : null,
  };
});

console.log('=== 세부분류 ===');
console.log(JSON.stringify(storage.subcats, null, 2));
console.log('\n=== 할 일 샘플 (처음 3개) ===');
console.log(JSON.stringify(storage.tasks, null, 2));

await browser.close();
