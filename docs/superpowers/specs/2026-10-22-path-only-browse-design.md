# 경로 기반 무설치 웹 조회

사용자는 2026-10-22 제안한 `/browse/` 방식으로 무설치 웹 조회 전체 전환을 승인했습니다. 기존 MCP 프로토콜, JSON API, 구형 HTML URL은 유지합니다. 이 문서는 구현 선택을 구체화하며 추가 승인 대기가 아닙니다.

## 계약

- 기본 주소는 `/browse/{service}/{operation}/{주요 검색 조건}`입니다. 예: `/browse/daiso/products/핫식스`, `/browse/daiso/stores/강남역`, `/browse/daiso/inventory/105603886/강남역`.
- 부가 조건은 경로의 이름/값 쌍입니다. 예: `/browse/daiso/products/수납박스/pageSize/3`, `/browse/daiso/products/펜/page/2/pageSize/10`.
- 주요 검색어를 생략하고 필터만 사용할 때는 `/browse/query/{service}/{operation}/{이름}/{값}`을 사용합니다. 예: `/browse/query/daiso/stores/sido/서울/gugun/마포구`.
- `/browse/daiso/product/{id}`와 `/browse/daiso-jp/product/{id}`는 상품 상세입니다. 상품 검색의 숫자 검색어와 구분합니다.
- 모든 현재 지원 공개 읽기 API를 명시적 목록으로 허용합니다. 관리·건강검사·요청 제출·지원 중단 롯데마트·임의 목적지 프록시는 노출하지 않습니다.
- 외부 요청은 경로에 조건을 담습니다. `format=html`은 필요 없고 Accept와 무관하게 HTML을 반환합니다. 추적 쿼리는 조회 조건으로 사용하지 않습니다.
- 경로 데이터는 UTF-8로 한 번만 인코딩/디코딩합니다. 슬래시·퍼센트·점 세그먼트·빈 값도 가역 변환하며 잘못된 인코딩과 중복 이름은 외부 호출 전에 400으로 거절합니다.

## 처리와 보호

Browse 라우트는 동일 출처의 허용된 `/api/` 경로로 내부 dispatch합니다. 외부 HTTP 요청을 중복하지 않고 기존 입력 검증·캐시·일일 한도·중계·운영 인증을 그대로 통과합니다. 호출 제한은 한 번만 차감하며 인증·한도·원본 장애를 성공이나 품절로 바꾸지 않습니다. POST는 지원하지 않습니다.

기존 HTML 렌더러가 모든 필드·정상 0·미확인 수량·오류 상태와 Retry-After를 보존합니다. 상세·재고·진열 위치와 page 규약을 지원하는 API의 페이지 이동은 실제 식별자와 현재 필터를 보존하는 browse 링크입니다. 원본 상품 이미지 규칙과 HTML escape/CSP는 유지합니다.

## 발견 안내

README 접힘 안내, 루트, 최신 버전 안내, llms.txt, prompt 전체 서비스 예시, service-reference 및 관련 웹 사용 안내를 경로 방식으로 통일합니다. 버전을 갱신하고 `/guide/latest`가 현재 안내를 가리키도록 유지합니다. JSON·OpenAPI·CLI를 사용하는 개발자 계약은 유지합니다. README 이미지와 배너는 변경하지 않습니다.

## 검증과 한계

전체 공개 읽기 경로와 변환의 왕복·한글·특수문자·필터·페이지·거절 경로를 검사합니다. 실제 API 경계를 이용해 browse/JSON의 데이터·오류·quota 동등성 및 HTML 후속 링크를 검증합니다. 공개 MCP 도구는 10개 유지합니다. 전체 check, 기존 coverage gate 100%, build/discovery, 독립 리뷰, GitHub 검사 후 병합·배포합니다. 운영 WebFetch의 직접 URL 열기와 결과 링크 이동을 각각 검증하며, 외부 도구 접근 정책의 완전한 해결을 보장하지 않습니다. 일본 공식 매장 사이트 중단 등 기존 외부 장애를 새 기능으로 숨기지 않습니다.
