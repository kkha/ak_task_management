import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

// 설정 버튼 클릭
const settingsBtn = page.locator('#settings-btn');
await settingsBtn.click();
await page.waitForTimeout(500);

// 스크린샷
await page.screenshot({ path: 'C:/temp/unified-settings.png', fullPage: false });
console.log('Settings dialog screenshot saved');

await page.waitForTimeout(5000);
await browser.close();
