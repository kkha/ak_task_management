import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('마이그레이션') || text.includes('변경')) {
      console.log(`✅ [콘솔] ${text}`);
    }
  });

  try {
    console.log('🚀 테스트 시작: 페이지 로드\n');
    await page.goto(`file://${indexPath}`);
    await page.waitForLoadState('networkidle');

    // 초기화 완료 대기
    await page.waitForFunction(() => window._state !== undefined, { timeout: 5000 });
    await page.waitForTimeout(1000);

    console.log('✅ 페이지 로드 완료\n');

    // JavaScript를 직접 실행해서 테스트
    console.log('📝 Step 1: 세부분류 추가 및 할일 생성 (스크립트)\n');

    const result = await page.evaluate(() => {
      // 전역 상태 접근
      console.log('🔍 현재 상태 확인:', {
        tasks: window._state?.tasks?.length || 'unknown',
        subcats: window._state?.subcats
      });

      // 테스트 데이터 설정
      if (window._state) {
        // 세부분류 추가
        window._state.subcats.업무 = window._state.subcats.업무 || {};
        window._state.subcats.업무['테스트'] = ['테스트1', '테스트2'];

        // 할일 생성
        const task = {
          id: 'test-' + Date.now(),
          text: '테스트 할일',
          category: '업무',
          subcategory: '테스트',
          completed: false,
          createdAt: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
        };
        window._state.tasks.push(task);

        console.log('✅ 테스트 데이터 추가 완료');
        return { success: true, taskId: task.id };
      }
      return { success: false, msg: 'state 없음' };
    });

    console.log(`결과: ${JSON.stringify(result)}\n`);

    // 2단계: 세부분류 삭제
    console.log('📝 Step 2: 세부분류 "테스트" 삭제 (스크립트)\n');

    const deleteResult = await page.evaluate(() => {
      if (window._state) {
        // 세부분류 삭제 전
        const beforeCount = window._state.tasks.filter(t => t.subcategory === '테스트').length;
        console.log(`🔍 삭제 전 "테스트" subcategory 할일: ${beforeCount}개`);

        // 세부분류 삭제
        delete window._state.subcats.업무['테스트'];

        // render() 호출 (마이그레이션 로직 실행)
        if (window._render) {
          console.log('🔄 render() 호출...');
          window._render();
        }

        // 삭제 후
        const afterCount = window._state.tasks.filter(t => t.subcategory === '테스트').length;
        console.log(`🔍 삭제 후 "테스트" subcategory 할일: ${afterCount}개`);

        return {
          beforeCount,
          afterCount,
          success: afterCount === 0
        };
      }
      return { success: false };
    });

    console.log(`결과: ${JSON.stringify(deleteResult)}\n`);

    // 결과 확인
    if (deleteResult.success) {
      console.log('✅ 마이그레이션 성공! 세부분류가 삭제되면 할일 태그도 제거됨\n');
    } else {
      console.log('❌ 마이그레이션 실패! 여전히 할일에 태그가 남아있음\n');
    }

    // 3단계: 콘솔 로그 확인
    console.log('📝 Step 3: 콘솔 로그 확인\n');
    const migrationLogs = logs.filter(l => l.includes('마이그레이션'));
    const changeLogs = logs.filter(l => l.includes('변경'));

    console.log(`발견된 마이그레이션 로그: ${migrationLogs.length}개`);
    console.log(`발견된 변경 로그: ${changeLogs.length}개\n`);

    if (migrationLogs.length > 0) {
      console.log('마이그레이션 로그:');
      migrationLogs.slice(0, 3).forEach(l => console.log('  ' + l));
    }

    console.log('\n🎉 테스트 완료!');

  } catch (error) {
    console.error('❌ 에러:', error.message);
  } finally {
    await browser.close();
  }
})();
