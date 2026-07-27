# CU 공식 앱 User-Agent 기반 재고 조회 복구 설계

## 배경

CU 재고 API 직접 호출과 Zyte 폴백이 각각 `403 Request Blocked`, `520 Website Ban`으로 실패한다. 사용자 소유 Android 단말의 PocketCU 5.3.6 앱과 공개 웹 자산을 확인한 결과, 공식 앱은 WebView 기본 User-Agent 끝에 `;BGFCU`를 붙인다.

동일 요청을 비교한 운영 재현 결과는 다음과 같다.

- Android User-Agent만 사용: HTTP 403
- 공식 앱 표식 `;BGFCU`를 추가: HTTP 200, `resp_cd=0000`
- 세션 쿠키, DeviceId, 로그인 토큰: 성공에 필요하지 않음

따라서 결제나 Zyte 키 문제가 아니라, CU가 공식 앱 요청을 식별하는 User-Agent 규칙을 기존 클라이언트가 반영하지 못한 것이 원인이다.

## 접근 방식 비교

1. **공식 앱 User-Agent 표식만 추가 — 채택**
   - 최소 변경이며 직접 호출을 복구한다.
   - 단말·계정 식별값을 다루지 않는다.
   - 직접 호출 성공 시 Zyte 사용량이 발생하지 않는다.
2. 재고 화면을 먼저 열어 세션 쿠키를 생성
   - 추가 요청과 쿠키 관리가 필요하지만 실측상 성공 조건이 아니다.
3. Zyte 브라우저 호출로 강제 전환
   - 비용과 지연이 증가하고 현재 Website Ban도 해결하지 못한다.

## 구현

`src/services/cu/client.ts`의 CU JSON 요청 공통 헤더에 일반 Android WebView 형식의 User-Agent와 공식 앱 표식 `;BGFCU`를 추가한다. 특정 단말 ID, 쿠키, Authorization은 추가하지 않는다. 기존 direct-first 및 Zyte fallback 흐름은 변경하지 않는다.

## 오류 처리

직접 호출이 향후 다시 400/403/429로 차단될 때만 기존 Zyte 폴백을 사용한다. upstream 차단이 계속되면 현재의 degraded 응답 계약을 그대로 유지한다.

## 테스트와 완료 조건

1. 회귀 테스트는 CU 재고 직접 요청의 User-Agent가 `;BGFCU`로 끝나는지 검증한다.
2. 해당 테스트가 구현 전 실패하고 구현 후 통과해야 한다.
3. CU 클라이언트 테스트, 전체 테스트, lint, 타입 검사, 빌드를 한 번에 하나씩 실행한다.
4. 배포 후 운영 `/api/cu/inventory`가 `available: true`, 상품 결과를 반환하는지 확인한다.
5. 운영 헬스체크에서 `cu.inventory`가 더 이상 degraded가 아닌지 확인한다.

## 범위 제외

- PocketCU 로그인 토큰 또는 사용자 단말 정보 수집
- CU 외 서비스의 User-Agent 변경
- 불필요한 Zyte 브라우저 자동화
