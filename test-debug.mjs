import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const allLogs = [];
  const errors = [];

  page.on('console', msg => {
    allLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    errors.push(err.toString());
  });

  try {
    console.log('🚀 페이지 로드 중...\n');
    await page.goto(`file://${indexPath}`, { waitUntil: 'domcontentloaded', timeout: 10000 });

    // 3초 대기
    await page.waitForTimeout(3000);

    console.log('📋 콘솔 로그:');
    allLogs.forEach((log, i) => {
      console.log(`  ${i + 1}. ${log}`);
    });

    if (errors.length > 0) {
      console.log('\n❌ JavaScript 에러:');
      errors.forEach(err => console.log('  ' + err));
    }

    // 상태 확인
    const stateCheck = await page.evaluate(() => {
      return {
        hasState: typeof window._state !== 'undefined',
        hasRender: typeof window._render !== 'undefined',
        hasCommit: typeof window._commit !== 'undefined',
      };
    }).catch(e => ({ error: e.toString() }));

    console.log('\n✅ 상태 확인:', JSON.stringify(stateCheck, null, 2));

  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
