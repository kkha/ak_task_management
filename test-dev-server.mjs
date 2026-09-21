import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[DEBUG]') || text.includes('마이그레이션') || text.includes('변경됨')) {
      console.log(`✅ [콘솔] ${text}`);
    }
  });

  try {
    console.log('🚀 개발 서버에서 테스트 시작...\n');

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 테스트 데이터 생성
    console.log('📝 Step 1: 테스트 데이터 생성\n');

    await page.evaluate(() => {
      const subcats = JSON.parse(localStorage.getItem('task-app.subcategories') || '{}');
      subcats.업무 = subcats.업무 || {};
      subcats.업무['테스트'] = ['테스트1', '테스트2'];
      localStorage.setItem('task-app.subcategories', JSON.stringify(subcats));

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
    });

    console.log('✅ 데이터 생성 완료\n');

    // 페이지 새로고침
    console.log('📝 Step 2: 페이지 새로고침\n');
    await page.reload();
    await page.waitForTimeout(2000);

    // 세부분류 삭제
    console.log('📝 Step 3: 세부분류 "테스트" 삭제\n');
    await page.evaluate(() => {
      const subcats = JSON.parse(localStorage.getItem('task-app.subcategories') || '{}');
      delete subcats.업무['테스트'];
      localStorage.setItem('task-app.subcategories', JSON.stringify(subcats));
    });

    // 페이지 새로고침 (마이그레이션 실행)
    console.log('📝 Step 4: 페이지 새로고침 (마이그레이션 실행)\n');
    logs.length = 0;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log(`   콘솔 로그: ${logs.slice(0, 3).join(' | ')}`);

    // 실행 흐름 확인
    const flags = await page.evaluate(() => ({
      initStarted: !!window._initStarted,
      tasksLoaded: !!window._tasksLoaded,
      subcatsLoaded: !!window._subcatsLoaded,
      beforeRender: !!window._beforeRender,
      afterRender: !!window._afterRender,
      renderCalled: window._renderCalled || 0,
    }));
    console.log(`   실행 흐름:`, flags);

    // 결과 확인
    console.log('📝 Step 5: 결과 확인\n');
    const result = await page.evaluate(() => {
      const tasks = JSON.parse(localStorage.getItem('task-app.tasks') || '[]');
      const taskWithSubcat = tasks.filter(t => t.subcategory === '테스트');
      return {
        totalTasks: tasks.length,
        tasksWithDeletedSubcat: taskWithSubcat.length,
        firstTask: tasks[0],
      };
    });

    console.log(`결과:`);
    console.log(`✅ 총 할일: ${result.totalTasks}개`);
    console.log(`❌ "테스트" 태그가 남은 할일: ${result.tasksWithDeletedSubcat}개`);
    console.log(`   첫번째 할일:`, result.firstTask);

    console.log(`\n📋 수집된 콘솔 로그 (마이그레이션 관련):`);
    const migrationLogs = logs.filter(l => l.includes('마이그레이션') || l.includes('[DEBUG'));
    if (migrationLogs.length > 0) {
      migrationLogs.forEach(l => console.log(`   ${l}`));
    } else {
      console.log(`   (없음)`);
    }

    if (result.tasksWithDeletedSubcat === 0) {
      console.log('\n🎉 ✅ 성공! 마이그레이션 작동함\n');
    } else {
      console.log('\n❌ 실패! 마이그레이션 미작동\n');
    }

  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
