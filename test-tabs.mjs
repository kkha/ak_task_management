import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

const settingsBtn = page.locator('#settings-btn');
await settingsBtn.click();
await page.waitForTimeout(500);

// 세부분류 탭
const subcatTab = page.locator('[data-tab="subcat"]');
await subcatTab.click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'C:/temp/subcat-tab.png', fullPage: false });

// 가져오기/내보내기 탭
const ioTab = page.locator('[data-tab="import-export"]');
await ioTab.click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'C:/temp/import-export-tab.png', fullPage: false });

console.log('All tabs tested');
await page.waitForTimeout(3000);
await browser.close();
