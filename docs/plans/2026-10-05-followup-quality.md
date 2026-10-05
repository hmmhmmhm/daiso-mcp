# 남은 조회 오동작 개선 계획

> 에이전트 작업: superpowers:dispatching-parallel-agents와 test-driven-development로 독립 파일 영역을 분담하고, 명세 검토 후 독립 품질 리뷰를 수행합니다.

**목표:** 사용자 승인한 R1–R4를 수정하고 운영 서버와 공개 CLI에서 원래 재현을 검증합니다.
**설계:** 상품과 매장 식별자를 유지해 선택한 매장의 관측값만 표시합니다. 실제 검색 페이지 계약을 확인해 Seven 페이지를 처리합니다. 비교의 부분 실패는 캐시에 저장하지 않으며 기존 부분 실패 캐시는 namespace 갱신으로 제거합니다.
**기술:** TypeScript/Hono/Zod/Vitest/Cloudflare Worker, Node CLI, 기존 Mac 중계.

## R1/R2 대화형 CLI

대상: src/cli/interactiveTypes.ts, src/utils/cliInteractiveHelpers.ts, src/cli/interactiveItemSearch.ts와 필요한 작은 helper; tests/app의 대화형 테스트.

- [x] 실제 API fixture로 OY 매장 재고10/O2O8/검색값0, 미확인/미판매/진짜0, CU 매장stock48/픽업false/상품픽업true를 실패 테스트로 작성하고 red 기록.
- [x] 매장 코드를 파싱·보존. 이름/address fallback은 정확한 매칭만 허용. 잘못된 매장으로 대체하지 않음.
- [x] OY는 선택한 상품·매장의 storeInventory만 수량/상태로 출력. 관측하지 못한 수량은 확인 불가.
- [x] CU는 선택 상품이 최초 stockItemCode와 다르면 해당 상품명으로 재조회하고 반환 상품코드 일치 확인. 선택 매장의 stock/채널 설정을 출력. 실패·미확인은 확인 불가이며 일반 상품 설정을 매장 값으로 사용하지 않음.
- [x] 기존 대화형 흐름과 새 선택/재조회 테스트 통과.

## R3 Seven 페이지

대상: src/services/seveneleven/client.ts, productKeyword.ts, 관련 테스트; 실제 계약 변경 시 scripts/relay/convenience.ts 및 중계 테스트.

- [x] 공식 공개 프런트엔드의 검색 요청 형식과 기존 중계 원시 페이지 응답을 확인. 페이지 계약을 추측해 구현하지 않음.
- [x] 페이지1/2/3의 상품코드 차이, 크기 한도, 총개수, 마지막 빈 페이지를 검증하는 red 테스트 작성.
- [x] 확인한 계약으로 client/relay 요청 구현. 서로 다른 컬렉션 병합·중복·변형 검색에도 페이지 중복과 이중 slicing 방지.
- [ ] 실제 운영과 중계 최소 호출로 동일 검색의 페이지별 코드를 대조. 기존 원장·인증 보존.

## R4 비교 실패 캐시

대상: src/utils/cache.ts, src/api/routes/compareRoutes.ts, src/api/compareHandlers.ts, src/cliRenderer.ts 및 tests/app/api/utils.

- [x] 실제 cache 저장소를 주입해 첫 partial failure 후 회복 결과 재조회가 실패하는 red 테스트 작성.
- [x] errors가 있는 비교 응답은 no-store 및 캐시 저장 생략. 다른 정상 조회의 캐시 동작은 보존. 필요한 경우 cache option의 응답 predicate로 해당 route에만 적용.
- [x] 비교 namespace 갱신으로 이전 partial result 제거. CLI에 서비스 부분 실패를 분명히 표시.
- [x] 실패/정상/null·잘못된 응답 및 기존 정상 cache 테스트 통과.

## 통합·리뷰·배포

- [x] 독립 명세 검토 및 품질 리뷰, check/전체 tests/coverage100/build/audit0 확인. src 파일450줄 이하.
- [ ] 한국어 커밋/PR, GitHub CI·Coverage·CodeQL 성공 확인 후 기존 사용자 승인에 따라 병합·Worker 배포.
- [ ] 중계 계약이 변경되면 소유 프로세스 종료 확인→런타임 교체→재기동·health·원장보존 검증. 변경 없으면 불필요 재기동하지 않음.
- [ ] CLI patch 릴리스·tag/gitHead·npm tarball무결성 확인, 공개 코드에서 OY/CU 실제 API fixture 재현과 Seven 페이지/비교 회복 검증.
- [ ] 보고서/PROJECT 갱신, 작업용 checkout 정리와 완료 알림.

공유 호출 예산: 편의점 일일 잔여 최소150회 유지, 매분 잔여 확인 후 필요한 최소 읽기 요청만 수행. 한도·원장·인증·Google/Zyte 설정 및 롯데마트 종료 정책은 바꾸지 않습니다. 메시지 제출 도구는 실제 발송하지 않습니다.
