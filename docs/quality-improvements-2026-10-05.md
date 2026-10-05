# 조회 오동작 개선 기록

2026년 10월 5일 전체 감사에서 확인한 조회 실패와 잘못된 확정값을 수정했습니다. 정상 수량 0개는 그대로 유지하고, 관측되지 않은 수량은 확인 불가로 구분합니다. Google 지오코딩·Zyte 비활성화와 롯데마트 지원 종료 정책은 유지합니다.

## 재고와 좌석의 의미

- 다이소·CU·GS25·이마트24의 수량이 `null`이면 upstream 수량을 확인하지 못한 상태입니다. CLI는 “확인 불가”로 표시합니다. 세븐일레븐은 기존 미확인 값 `-1`을 유지합니다. 실제 숫자 0은 확인된 0개입니다.
- 다이소가 명시적으로 실패한 재고 응답을 보내면 성공 0개로 변환하지 않습니다. 매장 집계에는 `unknownStockCount`를 제공합니다.
- CU·이마트24는 정확한 상품명 후보를 우선 선택합니다. 일반 키워드의 첫 후보를 사용하는 경우 `selectionReason`으로 선택 근거를 제공합니다. 세븐일레븐의 지역 매칭 실패는 다른 지역 매장으로 대체하지 않습니다.
- GS25 매장 메타데이터와 상품 후보에서 관측되지 않은 재고는 `null`입니다. `unknownStockStoreCount`를 함께 제공하며, 알려진 수량이 하나도 없으면 합계도 `null`입니다.
- CGV의 숫자 0은 임시 수량으로 덮어쓰지 않습니다. 각 영화관의 좌석 수가 없거나 비정상이면 해당 수량과 유도된 예약 수를 `null`로 제공합니다.
- 올리브영은 지역에서 확인한 상품만 지역 재고 집계에 포함합니다. 빈 재고 payload는 미확인, 전부 미판매인 상품은 `not_sold`입니다. 지역 조회 실패 시 검색 캐시에 남은 과거 매장 수량을 재사용하지 않습니다.

수량을 무조건 숫자로 가정하던 API 소비자는 `null`을 확인 불가로 처리해야 합니다. `null`을 숫자 0으로 변환하면 이번에 수정한 품절 오판을 다시 만들게 됩니다. OpenAPI 및 MCP 출력 계약도 갱신했습니다.

## 조회 범위와 호출 계약

| 감사 항목 | 개선 결과 | 회귀 검증 |
|---|---|---|
| L1·L2 | 좌표 전용 메가박스 MCP의 null 검색어, 세븐일레븐 카탈로그의 `{totalCount,items}` 구조 허용 | `quality-contracts.test.ts` |
| L3·L5 | 세븐일레븐 MCP의 중복 페이지 처리 제거와 전체 개수 보존, 이마트24 개수 한도 적용 | `inventory-quality`, `productKeyword` |
| L4 | REST/MCP 가격 비교에도 편의점 중계 설정 전달, 모든 서비스 결과 개수 한도 적용 | `quality-contracts`의 중계 경로·서비스별 과다 응답 검사 |
| L6·F6–F8 | 영화 코드 필터 엄격 유지, 실제 0좌석 보존, 누락 좌석 nullable, 메가박스 위치 해석 실패 시 범위 확대 금지 | 영화관 `quality-regressions`, `seat-count` |
| L7 | 편의점의 typed 중계 오류를 보존. HTTP 429와 Retry-After, diagnostics.quotaReason/retryAfter 전달 | 실제 Hono GS25·CU·Seven handler 검사 및 `inventory-quota` |
| L8 | 롯데마트 지원 종료 오류에 폐기된 조회 명령 안내 제거 | `quality-cli` |
| F1–F5 | 미확인 수량, 정확한 후보 선택, 지역 매칭 및 합계 수정 | `inventory-quality`, `inventory-summary`, `inventoryQuantity` |
| F9·F10 | Places·Opinet 잘못된 JSON/envelope 거절. 영화관 날짜·양수 정수 한도·좌표 쌍 검증 | 각 client 및 `cinema-validation` |
| F11–F14 | 올리브영 종료 복구, 미확인/미판매 상태, 지역 집계, 과거 재고 재사용 방지 | OY `quality-regressions`, REST `quality-oliveyoung-counters`, relay 테스트 |

## 올리브영 정리 시간과 복구

정상 종료의 상위 lifecycle이 정한 10초 절대 deadline을 supervisor·guard·ownership으로 전달합니다. ownership은 guard의 profile 정리와 종료 확인을 위해 500ms를 남깁니다. IPC 연결 해제 같은 독립 정리는 로컬 8초 예산을 사용합니다. 서로 다른 층에서 시간을 새로 시작해 종료 기한을 넘기는 문제를 방지합니다.

이미 소유 프로세스가 없다는 snapshot을 확인했다면 Playwright close rejection 때문에 영구 실패를 유지하지 않습니다. 소유권이 불확실하거나 프로세스·profile 종료를 시간 안에 확인하지 못하면 marker와 실패 상태를 유지합니다. 임의 Chrome을 종료하거나 marker를 무조건 지우지 않습니다. 가짜 시계 테스트에서 느린 close·강제 회수 확인·profile 완료와 시간 초과를 함께 검증했습니다.

## 의존성과 검증

코드·스크립트에서 사용하지 않는 `workers-mcp`를 제거했습니다. 이 의존성이 가져오던 `braces` 취약점 경로도 제거되어 production 및 전체 의존성 audit는 0건입니다.

수정 후 검증은 228개 파일·2,631개 테스트, `npm run check`, 100% Statements/Branches/Functions/Lines coverage, build, Worker dry run을 통과했습니다. 독립 리뷰에서 비교 결과 한도·GS25 미확인 합계·메타데이터의 잘못된 0·REST/MCP 빈 결과 차이를 찾아 추가 수정하고 재검증했습니다.

운영 확인은 배포 후 같은 상품 코드·매장·지역의 결과를 REST/MCP/공개 CLI로 확인해야 합니다. 정상 검색 결과만으로 모든 실패 경로가 정상이라는 결론을 내리지 않습니다. 편의점 공유 매분 30회·일일 3,000회 원장과 인증 세션을 보존하고, 예산이 부족하면 재시도 시각을 기다립니다.
