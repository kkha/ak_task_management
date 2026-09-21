import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 콘솔 로그 수집
  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  try {
    console.log('🚀 테스트 시작...\n');

    // 페이지 열기
    await page.goto(`file://${indexPath}`);
    await page.waitForLoadState('networkidle');
    console.log('✅ 페이지 로드 완료\n');

    // 1. 세부분류 "테스트123" 추가
    console.log('📝 Step 1: 세부분류 "테스트123" 추가...');
    await page.click('button:has-text("통합설정")');
    await page.waitForTimeout(300);
    await page.click('text="세부분류 편집"');
    await page.waitForTimeout(500);

    // 업무 섹션 찾기
    const addButtons = await page.locator('button:has-text("추가")').all();
    if (addButtons.length >= 2) {
      await addButtons[1].click(); // 업무 섹션의 추가 버튼
    }
    await page.waitForTimeout(300);

    // 입력창에 "테스트123" 입력
    const inputs = await page.locator('input[type="text"]').all();
    await inputs[inputs.length - 1].fill('테스트123');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    console.log('✅ 세부분류 추가 완료\n');

    // 2. 할일 등록 (업무, 세부분류: 테스트123)
    console.log('📝 Step 2: 할일 등록 (업무 > 테스트123)...');
    await page.click('[id="settings-dialog"]', { force: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 작성기에서 할일 추가
    const textInput = await page.locator('.composer__text').first();
    await textInput.click();
    await textInput.fill('테스트 할일');
    await page.waitForTimeout(200);

    // 카테고리를 업무로 변경
    const categorySelect = await page.locator('.composer__category');
    await categorySelect.selectOption('업무');
    await page.waitForTimeout(300);

    // 세부분류 선택
    const subcatSelect = await page.locator('.composer__subcategory');
    await subcatSelect.selectOption('테스트123');
    await page.waitForTimeout(300);

    // 추가 버튼 클릭
    const addTaskBtn = await page.locator('button:has-text("추가")').first();
    await addTaskBtn.click();
    await page.waitForTimeout(500);
    console.log('✅ 할일 등록 완료\n');

    // 3. 업무현황에서 "테스트123" 확인
    console.log('📝 Step 3: 업무현황에서 "테스트123" 확인...');
    const statusPanel = await page.locator('.status-summary').textContent();
    if (statusPanel.includes('테스트123')) {
      console.log('✅ 업무현황에 "테스트123" 표시됨\n');
    } else {
      console.log('❌ 업무현황에 "테스트123" 없음\n');
    }

    // 4. 세부분류 "테스트123" 삭제
    console.log('📝 Step 4: 세부분류 "테스트123" 삭제...');
    await page.click('button:has-text("통합설정")');
    await page.waitForTimeout(300);
    await page.click('text="세부분류 편집"');
    await page.waitForTimeout(500);

    // 테스트123 삭제 버튼 찾기
    const deleteButtons = await page.locator('button:has-text("삭제")').all();
    // 마지막 삭제 버튼이 테스트123의 삭제 버튼일 것
    if (deleteButtons.length > 0) {
      await deleteButtons[deleteButtons.length - 1].click();
      await page.waitForTimeout(500);
      console.log('✅ 세부분류 삭제 완료\n');
    }

    // 5. 콘솔 로그에서 마이그레이션 확인
    console.log('📝 Step 5: 콘솔 로그 확인...');
    await page.waitForTimeout(1000);

    const migrationLogs = logs.filter(l => l.includes('마이그레이션'));
    if (migrationLogs.length > 0) {
      console.log('✅ 마이그레이션 로그 발견:');
      migrationLogs.forEach(l => console.log('   ' + l));
    } else {
      console.log('❌ 마이그레이션 로그 없음');
    }

    // 6. 할일 목록에서 "테스트123" 제거 확인
    console.log('\n📝 Step 6: 할일 목록 확인...');
    const taskList = await page.locator('.task-list').textContent();
    const taskContent = await page.locator('.task__text').textContent();

    if (taskContent.includes('테스트123')) {
      console.log('❌ 여전히 "테스트123" 태그가 있음 (수정 실패)');
    } else {
      console.log('✅ "테스트123" 태그 제거됨 (수정 성공)');
    }

    // 7. 업무현황에서 "테스트123" 제거 확인
    console.log('\n📝 Step 7: 업무현황 재확인...');
    const finalStatus = await page.locator('.status-summary').textContent();
    if (finalStatus.includes('테스트123')) {
      console.log('❌ 여전히 "테스트123"이 업무현황에 있음 (수정 실패)');
    } else {
      console.log('✅ "테스트123"이 업무현황에서 제거됨 (수정 성공)');
    }

    console.log('\n🎉 테스트 완료!\n');
  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
