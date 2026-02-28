/**
 * 다이소 API 리플레이 세션 테스트
 *
 * 실제 브라우저가 보내는 요청을 재현하여 테스트합니다.
 */

// 1. 위치 기반 매장 검색 (GET 방식)
async function testLocationSearch() {
  console.log('\n=== 위치 기반 매장 검색 테스트 ===');

  // 서울 시청 좌표
  const lat = 37.5665;
  const lng = 126.9780;
  const mal_level = 5; // 지도 레벨

  const url = new URL('https://www.daiso.co.kr/cs/ajax/shop_search');
  url.searchParams.append('lat', lat);
  url.searchParams.append('lng', lng);
  url.searchParams.append('mal_level', mal_level);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.daiso.co.kr/cs/shop',
      }
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Response length:', text.length);
    console.log('Response preview:', text.substring(0, 200));

    // HTML에서 매장 정보 추출 시도
    if (text.includes('bx-store')) {
      console.log('✅ 매장 데이터 발견!');
      // HTML 파싱 필요
    } else {
      console.log('❌ 매장 데이터 없음');
    }

    return text;
  } catch (error) {
    console.error('에러:', error.message);
    return null;
  }
}

// 2. 이름으로 매장 검색 (POST 방식)
async function testNameSearch(searchTerm = '강남') {
  console.log('\n=== 이름 검색 테스트 ===');
  console.log('검색어:', searchTerm);

  const formData = new URLSearchParams();
  formData.append('name_address', searchTerm);

  try {
    const response = await fetch('https://www.daiso.co.kr/cs/ajax/shop_search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.daiso.co.kr/cs/shop',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData.toString()
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Response length:', text.length);
    console.log('Response preview:', text.substring(0, 200));

    return text;
  } catch (error) {
    console.error('에러:', error.message);
    return null;
  }
}

// 3. 시도 목록 조회
async function testSidoList() {
  console.log('\n=== 시도 목록 조회 테스트 ===');

  try {
    const response = await fetch('https://www.daiso.co.kr/cs/ajax/sido_search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://www.daiso.co.kr/cs/shop',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);

    try {
      const json = JSON.parse(text);
      console.log('✅ JSON 파싱 성공:', json.length, '개 시도');
      return json;
    } catch {
      console.log('❌ JSON 파싱 실패');
      return null;
    }
  } catch (error) {
    console.error('에러:', error.message);
    return null;
  }
}

// 4. 시군구 목록 조회
async function testGugunList(sido = '서울특별시') {
  console.log('\n=== 시군구 목록 조회 테스트 ===');
  console.log('시도:', sido);

  const formData = new URLSearchParams();
  formData.append('sido', sido);

  try {
    const response = await fetch('https://www.daiso.co.kr/cs/ajax/gugun_search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://www.daiso.co.kr/cs/shop',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData.toString()
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);

    try {
      const json = JSON.parse(text);
      console.log('✅ JSON 파싱 성공:', json.length, '개 시군구');
      return json;
    } catch {
      console.log('❌ JSON 파싱 실패');
      return null;
    }
  } catch (error) {
    console.error('에러:', error.message);
    return null;
  }
}

// 실행
async function main() {
  console.log('🔍 다이소 API 리플레이 세션 테스트 시작\n');

  await testLocationSearch();
  await testNameSearch('강남');
  await testSidoList();
  await testGugunList('서울특별시');

  console.log('\n✅ 테스트 완료');
}

// Node.js 환경에서 실행
if (typeof module !== 'undefined' && module.exports) {
  main();
}

// 브라우저 환경에서 사용할 함수들 내보내기
if (typeof window !== 'undefined') {
  window.DaisoAPI = {
    testLocationSearch,
    testNameSearch,
    testSidoList,
    testGugunList,
  };
}
