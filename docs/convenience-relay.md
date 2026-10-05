# 편의점 Mac 중계

CU PocketCU, 세븐일레븐 공식 앱 API와 GS25 상품·재고 API를 현재 Mac의 브라우저 없는 HTTP 중계로 호출합니다. 정상 API 응답 계약은 유지합니다. Worker에 설정이 없으면 기존 직접 호출을 사용하며, URL·토큰 또는 Access 인증의 부분 설정은 오류를 반환합니다.

## 실행과 설정

기존 `scripts/relay/dtryx-start.ts`의 127.0.0.1:4320 서버에 `/v1/convenience/` 경로를 추가합니다. Dtryx의 토큰·원장·로그는 별도로 유지합니다. 기존 Dtryx 설정만 있는 실행도 지원합니다. 편의점 설정을 추가할 때는 아래 두 변수를 함께 설정하세요.

```dotenv
CONVENIENCE_RELAY_TOKEN=your_convenience_token
CONVENIENCE_RELAY_STATE_DIR=/absolute/path/to/convenience-state
```

상태 경로는 Dtryx 상태 경로와 다른 디렉터리여야 합니다. 이 디렉터리의 `quota.json`에는 재시작해도 유지되는 호출 원장이, `logs/`에는 입력·토큰·키를 제외한 제한된 관측 로그가 저장됩니다. 편의점 예산은 하루 3,000회, 분당 30회이며 Dtryx·올리브영 예산과 공유하지 않습니다.

Worker에는 아래 바인딩을 설정합니다. URL은 중계 호스트의 기본 URL이며 `/v1/convenience`를 붙이지 않습니다. HTTPS 또는 로컬 루프백 HTTP만 허용합니다. REST와 MCP가 동일한 설정을 사용합니다.

```dotenv
CONVENIENCE_RELAY_URL=https://your-relay.example
CONVENIENCE_RELAY_TOKEN=your_convenience_token
CONVENIENCE_ACCESS_CLIENT_ID=your_access_client_id
CONVENIENCE_ACCESS_CLIENT_SECRET=your_access_client_secret
```

Cloudflare Tunnel에서 `/v1/convenience/.*` 경로를 4320 서버로 전달하고 기존 Access 정책을 적용합니다. Access를 사용하지 않는 로컬 실행에서는 두 Access 변수를 모두 생략합니다. 실제 토큰·키는 `.env`, 비공개 런타임 환경, Worker secrets에만 보관합니다.

GS25 재고는 별도 공식 앱 인증키가 필요합니다. `GS25_API_KEY`를 Worker 또는 Mac 중계 환경에 설정합니다. Worker 키는 인증된 HTTPS 중계의 본문으로 전달되고 공식 API의 `Api-Key` 헤더에만 사용됩니다. Mac 환경 키가 있으면 우선합니다. 키 없음과 원본 401/403은 인증 오류이며, 중계 혼잡·할당량 장애와 구분합니다. 키가 없으면 GS25 상품 검색은 사용할 수 있지만 재고 수량은 복구되지 않습니다.

## 고정 작업

모든 조회는 `Authorization: Bearer <CONVENIENCE_RELAY_TOKEN>`를 요구합니다. 아래 작업에 JSON POST만 허용하며 임의 URL·헤더·외부 경로 전달은 거절합니다.

| 작업 | 원본 조회 | 입력 |
| --- | --- | --- |
| `cu-prime` | 재고 검색 초기화 | `{}` |
| `cu-stock` | 상품 재고 검색 | 기존 PocketCU 검색 본문 |
| `cu-store` | 매장별 수량 | 기존 PocketCU 매장 본문 |
| `seven-goods` | 상품 검색 | `query`, `pageNo`, `pageSize` |
| `seven-store` | 매장 검색 | `collection: "store"`, `query`, `sort: "Date/desc"`, `listCount` |
| `seven-popwords` | 인기 검색어 | `label` |
| `seven-stock-meta` | 재고 상품 메타정보 | `itemCd` |
| `seven-stock` | 매장별 실재고 | `smCd`, `stokMngCd`, `stokMngQty`, `stockApplicationRate`, `storeList` |
| `seven-pages`, `seven-issues`, `seven-exhibitions` | 카탈로그 | `{}` |
| `gs25-products` | 상품 검색 | `query` |
| `gs25-stock` | 매장·재고 | 기존 BFF 조회 파라미터를 문자열 JSON으로 전달, 선택 `apiKey` |

인증된 GET `/v1/convenience/health`는 실행·대기 수와 원장·로그 상태를 반환합니다. 공개 Worker `/health`의 `config.convenienceRelay`는 설정 여부만 반환합니다.

## 제한과 결과 해석

CU 매장 키워드만 입력한 조회는 공식 웹에서 해당 지역 점포를 찾은 뒤 주소의 도로명·건물 번호 또는 지번을 보존하면서 층·호수·건물명 상세를 제외한 본주소를 좌표로 변환하고, 상품 코드와 함께 PocketCU 중계에 전달합니다. 주소 좌표를 확인하지 못하면 해당 지역의 점포 정보만 반환하고 수량은 `-1`(미확인)로 표시합니다. 기본 서울 중심 좌표로 다른 지역의 재고를 대신 조회하지 않습니다.

본문 16 KiB, 원본 응답 2 MiB, 동시 원본 호출 4개, 전체 요청 32개를 제한합니다. 본문·대기·원장·원본 처리를 합쳐 15초 기한을 적용하며 취소된 대기 요청은 예산을 소비하지 않습니다. 인증·입력 검증 뒤 성공한 상품·메타정보·초기화·카탈로그는 5분, 매장·실재고는 30초 동안 최대 256개·16 MiB의 메모리 캐시에 저장합니다. 캐시 적중은 호출 예산을 소비하지 않습니다. 오류는 캐시하지 않습니다.

리다이렉트·비 JSON·실패 envelope·잘못된 수량은 오류로 반환합니다. 재고 오류를 수량 0으로 바꾸지 않습니다. 세븐일레븐 수량 `-1`은 미확인이며 품절로 표시하지 않습니다. 반환된 매장의 수량이 모두 미확인이면 `stockAvailable`은 false입니다. 캐시 수량은 조회 시점 이후 바뀔 수 있으므로 실제 방문 전 점포 확인이 필요합니다.
