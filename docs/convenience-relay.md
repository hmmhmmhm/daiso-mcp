# 편의점 Mac 중계

개인 사이트에서 GS 토큰 발급을 처음 재현한다면 [단계별 로그인 가이드](gs25-auth-login-guide.md)를 읽으세요. 네이버 로그인 후 ‘닫기’ 화면·현재 번들 탐색·Windows와 도구 버전의 검증 범위를 설명합니다.

GS25 세션 만료·인증 장애를 복구할 때는 [정상 로그인 복구 운영 절차](gs25-auth-recovery-runbook.md)부터 읽으세요. 티켓·네이버 로그인·GS 토큰 저장·재기동·가상기기 종료 후 검증과 재현용 참조 코드를 포함합니다.

CU PocketCU, 세븐일레븐 공식 앱 API와 GS25 상품·재고 API를 현재 Mac의 브라우저 없는 HTTP 중계로 호출합니다. 정상 API 응답 계약은 유지합니다. Worker에 설정이 없으면 기존 직접 호출을 사용하며, URL·토큰 또는 Access 인증의 부분 설정은 오류를 반환합니다.

## 실행과 설정

기존 `scripts/relay/dtryx-start.ts`의 127.0.0.1:4320 서버에 `/v1/convenience/` 경로를 추가합니다. Dtryx의 토큰·원장·로그는 별도로 유지합니다. 기존 Dtryx 설정만 있는 실행도 지원합니다. 편의점 설정을 추가할 때는 아래 두 변수를 함께 설정하세요.

```dotenv
CONVENIENCE_RELAY_TOKEN=your_convenience_token
CONVENIENCE_RELAY_STATE_DIR=/absolute/path/to/convenience-state
```

상태 경로는 Dtryx 상태 경로와 다른 디렉터리여야 합니다. 이 디렉터리의 `quota.json`에는 재시작해도 유지되는 호출 원장이, `logs/`에는 입력·토큰·키를 제외한 제한된 관측 로그가 저장됩니다. CU·GS25·세븐일레븐이 공유하는 편의점 예산은 분당 69회, 하루 최대 100,000회이며 Dtryx·올리브영 예산과 공유하지 않습니다.

Worker에는 아래 바인딩을 설정합니다. URL은 중계 호스트의 기본 URL이며 `/v1/convenience`를 붙이지 않습니다. HTTPS 또는 로컬 루프백 HTTP만 허용합니다. REST와 MCP가 동일한 설정을 사용합니다.

```dotenv
CONVENIENCE_RELAY_URL=https://your-relay.example
CONVENIENCE_RELAY_TOKEN=your_convenience_token
CONVENIENCE_ACCESS_CLIENT_ID=your_access_client_id
CONVENIENCE_ACCESS_CLIENT_SECRET=your_access_client_secret
```

Cloudflare Tunnel에서 `/v1/convenience/.*` 경로를 4320 서버로 전달하고 기존 Access 정책을 적용합니다. Access를 사용하지 않는 로컬 실행에서는 두 Access 변수를 모두 생략합니다. 실제 토큰·키는 `.env`, 비공개 런타임 환경, Worker secrets에만 보관합니다.

GS25 재고는 Mac 중계의 `GS25_AUTH_SESSION_FILE`로 정상 로그인 세션을 사용할 수 있습니다. 파일은 현재 사용자 소유의 비공개 권한(0600)으로 보관하고 `accessToken`, `refreshToken`, `deviceId`만 저장합니다. GS 통합회원 또는 네이버 등 정상 로그인으로 GS가 발급한 토큰을 사용하며, 네이버 토큰을 직접 재고 API에 보내지 않습니다. GS 세션은 Worker·응답·로그에 전달하지 않고 고정 GS 재고 API의 Bearer 및 appinfo 헤더에만 사용합니다. 브라우저나 가상기기를 재고 조회마다 실행할 필요가 없습니다.

Access 토큰 만료1분 전 또는 재고401/403 응답 시 정상 `tokenReissue` API로 갱신합니다. 동시 갱신은1회 공유하고 각 caller의 취소는 다른 caller의 갱신을 끊지 않습니다. 갱신의 자체 기한은10초이며 원래 조회의15초 기한도 유지합니다. 갱신한 두 토큰은 같은 디렉터리의0600 임시파일을 원자교체해 저장합니다. 저장 실패·인증 철회·refresh 만료·재시도 후 인증거절은 실패로 전달하고 재고0을 만들지 않습니다. 인증 철회 후에는 정상 재로그인으로 파일을 교체하고 중계를 재기동합니다. 정상 조회 예산은 기존 원장에 기록하며 갱신은 별도 인증 요청입니다.

세션파일을 설정하지 않은 기존 `GS25_API_KEY` 방식도 유지합니다. 키를 Worker 또는 Mac 중계 환경에 설정하면 공식 API의 `Api-Key` 헤더에만 사용하며 Mac 환경 키가 우선합니다. 세션파일을 설정했으면 세션 인증을 우선하고 키로 자동 폴백하지 않습니다. 유효 세션·키 없음과 원본401/403은 인증 오류이며 중계 혼잡·할당량 장애와 구분합니다. 상품 검색은 별도 공개 경로입니다.

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

캐시 가능한 작업은 인증·입력 검증을 통과한 뒤 작업명과 모든 조회 조건이 같은 진행 요청을 공유합니다. 최초 동시 조회도 원본 호출·예산 소비는 한 번입니다. 각 응답 body와 request ID는 독립이며 공유를 기다린 요청은 `coalesced` 단계로 기록합니다. 한 요청의 취소는 다른 대기자에게 전파하지 않고, 마지막 대기자가 떠나면 원본 작업과 큐를 취소합니다. 최초 요청의 전체 15초 기한이 지난 공유 작업은 후속 대기자에게도 504를 반환하며, 실패·취소 결과는 캐시하지 않습니다. 동시 접수 32개·원본 4개·분당 69회·일 100,000회 상한은 유지합니다. 서로 다른 상품·지역·인증키·조회 조건은 임의로 합치지 않습니다.

리다이렉트·비 JSON·실패 envelope·잘못된 수량은 오류로 반환합니다. 재고 오류를 수량 0으로 바꾸지 않습니다. 세븐일레븐 수량 `-1`은 미확인이며 품절로 표시하지 않습니다. 반환된 매장의 수량이 모두 미확인이면 `stockAvailable`은 false입니다. 캐시 수량은 조회 시점 이후 바뀔 수 있으므로 실제 방문 전 점포 확인이 필요합니다.

분당 상한은 UTC 기준 각 1분 구간에 적용됩니다. 69 × 1,440분 = 99,360회이므로 정상적인 하루 합계는 10만 회 이하이며, 일일 100,000회 상한도 함께 검사합니다. 일일 원장은 UTC 자정(한국 시각 오전 9시)에 새 날짜로 전환됩니다. 한도 변경이나 재시작 시 기존 원장을 초기화하지 않습니다.

조회 재시도와 CU 주소·미확인 재고 처리는 [조회 오류 복구와 제한](status-resilience.md)을 참조하세요. 재시도도 같은 편의점 원장을 사용합니다.

### 세븐일레븐 점포 조회 거부 진단 (2026-10-07)

원본 `/real-stock/multi/01/stocks`에서 매장 1곳은 성공했으나 2곳은 HTTP 400, 코드 501, `정상적인 점포 조회 요청이 아닙니다.`로 거부되는 현상을 확인했습니다. 영구 정책인지 일시 제한인지는 확인되지 않았습니다.

이 응답은 공개 API에서 HTTP 502를 유지하고, 오류 문구를 `정상적인 점포 조회 요청이 아닙니다. 일시적인 외부 서비스 오류입니다. 잠시 후 재시도해주세요.`로 표시합니다. API와 MCP의 공통 `diagnostics`에는 원본 `upstreamStatus: 400`, `upstreamCode: 501`, `upstreamMessage`가 남습니다. 확인된 문구만 전달하며 응답 본문 전체나 알 수 없는 오류 문구는 공개하지 않습니다. 이 요청 거부는 `retryable: false`로 표시해 자동 재시도를 하지 않습니다. 안내 문구는 정책이 일시적이라는 확정 진단이 아닙니다.
