import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🚀 테스트 시작...\n');

    // 1. 페이지 로드
    await page.goto(`file://${indexPath}`);
    await page.waitForTimeout(2000);

    // 2. 세부분류와 할일 추가 (localStorage 직접 조작)
    console.log('📝 Step 1: 테스트 데이터 생성\n');

    const testResult1 = await page.evaluate(() => {
      // 세부분류 추가
      const subcats = JSON.parse(localStorage.getItem('task-app.subcategories') || '{}');
      subcats.업무 = subcats.업무 || {};
      subcats.업무['테스트'] = ['테스트1', '테스트2'];
      localStorage.setItem('task-app.subcategories', JSON.stringify(subcats));

      // 할일 추가
      const tasks = JSON.parse(localStorage.getItem('task-app.tasks') || '[]');
      const today = new Date().toISOString().split('T')[0];
      tasks.push({
        id: 'test-' + Date.now(),
        text: '테스트 할일',
        category: '업무',
        subcategory: '테스트',
        completed: false,
        createdAt: new Date().toISOString(),
        date: today,
      });
      localStorage.setItem('task-app.tasks', JSON.stringify(tasks));

      return {
        taskCount: tasks.length,
        taskWithSubcat: tasks.filter(t => t.subcategory === '테스트').length,
      };
    });

    console.log(`✅ 데이터 생성 완료:`);
    console.log(`   - 총 할일: ${testResult1.taskCount}개`);
    console.log(`   - "테스트" 태그 할일: ${testResult1.taskWithSubcat}개\n`);

    // 3. 페이지 새로고침 (앱 상태 로드)
    console.log('📝 Step 2: 페이지 새로고침\n');
    await page.reload();
    await page.waitForTimeout(2000);

    // 4. 세부분류 삭제 (localStorage에서)
    console.log('📝 Step 3: 세부분류 "테스트" 삭제 후 앱 상태 확인\n');

    const testResult2 = await page.evaluate(() => {
      // 세부분류 삭제
      const subcats = JSON.parse(localStorage.getItem('task-app.subcategories') || '{}');
      const beforeCount = Object.keys(subcats.업무 || {}).length;
      delete subcats.업무['테스트'];
      localStorage.setItem('task-app.subcategories', JSON.stringify(subcats));

      // 앱의 현재 상태는 아직 이전 상태임 (새로고침 필요)
      return { beforeCount, afterCount: Object.keys(subcats.업무).length };
    });

    console.log(`삭제 전 업무 세부분류: ${testResult2.beforeCount}개`);
    console.log(`삭제 후 업무 세부분류: ${testResult2.afterCount}개\n`);

    // 5. 페이지 새로고침 (마이그레이션 로직 실행)
    console.log('📝 Step 4: 페이지 새로고침 (마이그레이션 실행)\n');
    await page.reload();
    await page.waitForTimeout(2000);

    // 6. 최종 결과 확인
    console.log('📝 Step 5: 최종 결과 확인\n');

    const testResult3 = await page.evaluate(() => {
      const tasks = JSON.parse(localStorage.getItem('task-app.tasks') || '[]');
      const subcats = JSON.parse(localStorage.getItem('task-app.subcategories') || '{}');

      // "테스트" 태그가 있는 할일 찾기
      const tasksWithDeletedSubcat = tasks.filter(t => t.subcategory === '테스트');
      const migratedTasks = tasks.filter(t => t.text === '테스트 할일');

      return {
        totalTasks: tasks.length,
        tasksWithDeletedSubcat: tasksWithDeletedSubcat.length,
        migratedTask: migratedTasks.length > 0 ? migratedTasks[0] : null,
        availableSubcats: subcats.업무,
      };
    });

    console.log(`최종 확인:`);
    console.log(`✅ 총 할일: ${testResult3.totalTasks}개`);
    console.log(`❌ "테스트" 태그가 남은 할일: ${testResult3.tasksWithDeletedSubcat}개`);

    if (testResult3.migratedTask) {
      console.log(`   - 마이그레이션된 할일: "${testResult3.migratedTask.text}"`);
      console.log(`   - 현재 subcategory: ${testResult3.migratedTask.subcategory || '(없음/미분류)'}`);
    }

    console.log(`\n✅ 이용 가능한 업무 세부분류: ${JSON.stringify(Object.keys(testResult3.availableSubcats))}\n`);

    // 최종 판정
    if (testResult3.tasksWithDeletedSubcat === 0) {
      console.log('🎉 ✅ 성공! 세부분류가 삭제되면 할일 태그도 자동으로 제거됩니다.\n');
    } else {
      console.log('❌ 실패! 여전히 삭제된 세부분류 태그가 남아있습니다.\n');
    }

  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
