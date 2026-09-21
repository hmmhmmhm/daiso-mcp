# GS25·세븐일레븐 직접 호출 추가 조사

조사일: 2026-09-21 (KST). 유료 프록시 호출이나 운영 배포 없이 제한된 요청으로 확인했습니다.

## 세븐일레븐

공식 웹 `https://new.7-elevenapp.co.kr/`은 로컬에서 기존 Android User-Agent로 HTTP 200이며, Incapsula 스크립트를 포함합니다. 여기서 참조하는 최신 공식 번들 `https://static.7-elevenapp.co.kr/k7app/_nuxt/app.js`를 읽었습니다.

`useCustomFetch`는 GET 요청에 params, 그 외 요청에 body를 사용하며 `credentials: "include"`를 지정합니다. 확인한 공통 래퍼에 새로운 필수 고정 헤더를 추가하는 코드는 없었습니다. 이는 별도 쿠키 초기화 필요성을 확인할 근거이지만, 인증이 불필요한 모든 엔드포인트를 보장하지는 않습니다.

동일한 Cloudflare 원격 미리보기 Worker(HKG)에서 다음 세션 초기화 대조를 수행했습니다.

1. 기존 API 헤더로 동일 호스트 첫 페이지 GET: HTTP 403, Set-Cookie 2개.
2. 쿠키를 같은 Worker 요청 내에서만 보관해 공개 상품 검색 POST에 전달: HTTP 403, `Request unsuccessful` HTML.

쿠키 값은 출력하거나 저장하지 않았습니다. 첫 페이지 초기화 자체가 차단되므로 이 절차는 데이터 경로를 복구하지 못했습니다. 부모 조사에서 기존 User-Agent, 전체 데스크톱 User-Agent, Origin·Referer 조합 역시 원격 403이었습니다. 새 헤더나 API 경로 변경을 뒷받침하는 증거가 없어 서비스 코드는 변경하지 않았습니다.

## GS25

기존 상품 검색 요청 계약은 `POST https://b2c-apigw.woodongs.com/search/v3/totalSearch`, JSON `{query}`, 전체 Android User-Agent 및 기존 Origin·Referer입니다.

동일한 공개 앱 경로 `/api/gs25/products?keyword=%EC%BD%9C%EB%9D%BC`에 서로 다른 `probe` 값을 붙여 캐시를 우회했습니다.

| 실행 환경 | 결과 |
| --- | --- |
| 현재 코드 Cloudflare 원격 미리보기 | HTTP 200, 상품 20개 |
| 운영 `https://mcp.aka.page` | HTTP 500, `GS25_PRODUCT_SEARCH_FAILED`, 원본 HTTP 403 CloudFront HTML |

환경 차이를 재현했지만 운영과 미리보기의 정확한 차단 기준은 확인되지 않았습니다. 현재 요청 계약이 미리보기에서 실데이터를 반환하므로 서명·헤더 변경으로 운영 차단을 해결할 수 있다고 주장하지 않습니다. 운영 복구를 검증한 코드 변경은 없습니다.
