import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

// 스크린샷: 통합설정 버튼 확인
await page.screenshot({ path: 'C:/temp/unified-button.png', fullPage: false });
console.log('Screenshot saved');

await page.waitForTimeout(2000);
await browser.close();
