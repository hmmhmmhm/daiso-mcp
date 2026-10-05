# 다이소 입력·페이지 및 메가박스 표시 개선 계획

사용자 승인: 2026-10-06 전체 감사에서 발견한 항목을 모두 개선한다. 정상 조회·인증·중계 예산은 보존하며 기존 병합·배포·CLI 공개 범위에서 검증 후 반영한다.

## 처리 계약

- 다이소 REST·MCP는 유한한 양의 정수 page/pageSize/limit을 허용한다. 숫자 일부만 parseInt/parseFloat로 인정하지 않는다. 좌표는 둘 다 생략 시 기존 기본값, 지정 시 두 값이 함께 유한하며 위도[-90,90]/경도[-180,180] 범위여야 한다. handler 직접 호출에도 같은 기준을 적용한다. 실패는 외부 호출 전 REST400·MCP입력오류다.
- 재고 검색어에 매장이 존재하면 빈 후속 페이지는 stores[]와 실제 totalCount를 유지한다. 페이지 부족으로 다른 검색어 변형에 넘어가지 않는다. 검색 자체가 빈 경우의 기존 검색어 보정은 보존한다.
- 메가박스 이름의 HTML entity는 표시 문자열로 변환한다. 지점 주소는 현재 공식 HTML과 기존 형식을 모두 해석한다. 원본에 없는 주소는 만들지 않는다.
- 이전 오응답을 재사용하지 않도록 관련 REST 캐시 버전을 올린다. 새 라이브러리·인증·예산·영화관 타임아웃 정책은 추가하지 않는다.

## 실행 및 검증

- [x] 기존 2,806 테스트 baseline 확인.
- [x] 다이소 잘못된 페이지/좌표·키워드 보정·빈 페이지의 REST/MCP 회귀 테스트 RED → GREEN.
- [x] 실제 메가박스 HTML 확보, 이름/주소의 fixture 회귀 테스트 RED → GREEN.
- [x] 전체 check/coverage100/build/audit 및 독립 검토.
- [ ] PR/CI 병합과 동일 main 배포 확인. CLI 계약·게시 검증이 필요한 경우 버전 패치 후 공개.
- [ ] 운영 REST·MCP·게시 CLI 정상 조회와 오류 조건, 빈 페이지 전체수·메가박스 실제 주소 재검증.
- [ ] 보고서·PROJECT 기록 및 완료 알림.

검증: 243파일·2,968tests, statements/branches/functions/lines100%, check/build/audit0 및 독립검토 통과. 상세 OpenAPI JSON/YAML 생성 응답을 검증했다. 저장소 openapi.json/yaml은 축약 Actions 스펙이라 이번 개별 경로 변경의 diff가 없으며 /openapi-full.json/yaml에서 새 제약을 확인한다.
