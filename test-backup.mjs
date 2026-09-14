import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

// 설정 버튼 클릭
const settingsBtn = page.locator('#settings-btn');
await settingsBtn.click();
await page.waitForTimeout(500);

// 자동 백업 탭 클릭
const backupTab = page.locator('[data-tab="backup"]');
await backupTab.click();
await page.waitForTimeout(500);

// 스크린샷
await page.screenshot({ path: 'C:/temp/backup-settings.png', fullPage: false });
console.log('Backup settings screenshot saved');

await page.waitForTimeout(5000);
await browser.close();
