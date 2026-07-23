# MCP 오류 계약 및 날짜 안정 테스트 설계

## 배경

2026-07-23 정기점검에서 두 가지 회귀가 확인됐다.

첫째, MCP 도구가 `isError: true`와 함께 성공 응답용 `structuredContent`를 반환한다. MCP SDK 서버는 오류 결과의 출력 검증을 건너뛰지만, SDK 클라이언트는 `structuredContent`가 존재하면 성공용 `outputSchema`로 검증한다. 이 때문에 GS25 upstream 오류가 원래 오류 결과로 전달되지 않고 `-32602 Structured content does not match the tool's output schema`로 바뀐다.

둘째, `tests/durableObjects/dailyRateLimiter.test.ts`의 세 테스트가 `2026-07-22` 이벤트와 `asOf`를 사용하면서 `Date.now()`를 고정하지 않는다. 실제 KST 날짜가 2026-07-23 이후가 되자 운영 코드가 의도한 만료 409를 반환해 테스트가 실패한다.

## 목표

- MCP 도구 오류가 성공 출력 스키마 검증에 걸리지 않게 한다.
- 오류의 `isError`와 text content는 유지한다.
- 정상 MCP 응답의 `outputSchema`와 `structuredContent` 계약은 바꾸지 않는다.
- 날짜 경계 테스트가 실행 날짜와 관계없이 같은 결과를 내게 한다.
- 실제 MCP SDK 클라이언트로 회귀를 검증한다.

## 비목표

- 모든 도구의 성공 출력 스키마를 성공·오류 union으로 바꾸지 않는다.
- MCP smoke가 Zyte 정지 중에도 성공한 것으로 처리되게 하지 않는다.
- 일일 호출 제한이나 429 원장 운영 로직을 변경하지 않는다.
- Zyte 결제 한도나 외부 서비스 설정을 변경하지 않는다.

## 검토한 대안

### 1. 오류 응답에서 `structuredContent` 생략

`isError: true`일 때 text content만 반환한다. MCP SDK는 오류 결과에 `structuredContent`가 없어도 허용하므로 성공 스키마 검증을 피할 수 있다. 정상 결과는 기존 동작을 그대로 유지한다.

장점은 변경 범위가 작고 MCP SDK 계약에 맞으며 Home Assistant가 읽는 성공 스키마에 영향이 없다는 점이다. 단점은 오류를 `structuredContent`에서 기계적으로 읽던 비표준 소비자가 있다면 text content를 사용해야 한다는 점이다.

### 2. 모든 출력 스키마를 성공·오류 union으로 확장

표준 오류 객체를 모든 도구의 `outputSchema`에 포함한다. 기계 판독 오류를 유지할 수 있지만 40개 도구의 공개 스키마가 복잡해지고 Home Assistant 변환 호환성을 다시 검증해야 한다.

### 3. smoke 클라이언트에서 출력 검증 우회

운영 서버는 그대로 두고 smoke만 `-32602`를 허용한다. 실제 MCP 클라이언트의 오류가 계속 왜곡되므로 문제를 해결하지 못한다.

## 선택한 설계

대안 1을 적용한다.

`ServiceRegistry.registerTool`은 핸들러 결과를 다음 순서로 변환한다.

1. 핸들러가 예외를 던지면 `isError: true`와 기존 오류 메시지 text content만 반환한다.
2. 핸들러가 `isError: true` 결과를 반환하면 해당 text content와 `isError`만 유지한다.
3. 정상 결과에만 `buildStructuredContent`를 적용한다.
4. 정상 결과의 표준 상품·매장 컬렉션 정규화와 output schema는 변경하지 않는다.

날짜 테스트는 운영 코드를 바꾸지 않는다. 성공 결과나 내부 오류 전파를 확인하는 세 테스트에서 `Date.now()`를 `VALID_EVENT.day`와 같은 KST 날짜로 고정한다. `afterEach`의 `vi.restoreAllMocks()`가 각 테스트의 시각 mock을 정리하므로 다른 테스트와 상태를 공유하지 않는다.

## 테스트 설계

### MCP 오류 계약

- 기존 registry 단위 테스트를 먼저 바꿔 처리된 오류와 예외 오류에 `structuredContent`가 없기를 기대하게 한다.
- 수정 전 테스트가 현재의 `structuredContent` 때문에 실패하는 RED를 확인한다.
- 별도 MCP SDK 통합 테스트에서 `InMemoryTransport.createLinkedPair()`로 실제 `McpServer`와 `Client`를 연결한다.
- 성공용 output schema를 가진 도구가 오류를 반환할 때 `client.callTool()`이 `-32602`를 던지지 않고 `isError: true`, 원래 text content, `structuredContent` 부재 결과를 반환하는지 검증한다.
- 정상 도구 호출은 기존처럼 `structuredContent`를 반환하는지 함께 검증한다.

### 날짜 안정성

- 현재 실패하는 세 테스트를 그대로 RED 기준선으로 사용한다.
- 각 테스트에 고정 KST 시각을 추가한 뒤 세 테스트와 전체 Durable Object 테스트 파일이 통과하는지 확인한다.
- 실제 만료 409를 검증하는 자정 전환 테스트는 기존 시각 mock과 기대값을 유지한다.

### 전체 검증

- `npm run check`
- `npm run test:coverage`
- `npm run build`
- `npx wrangler deploy --dry-run`
- `npm audit --audit-level=low`
- 변경된 TypeScript 파일 450줄 제한과 `git diff --check`

## 배포와 운영 확인

변경을 기능 브랜치에 커밋하고 PR의 CI, Coverage, CodeQL을 통과시킨 뒤 `main`에 병합한다. 배포 워크플로 성공과 Cloudflare 버전 전환을 확인한다.

Zyte 정지 상태에서 GS25 MCP smoke 자체는 계속 실패할 수 있다. 배포 후 MCP SDK 클라이언트로 GS25 오류 호출을 실행해 `-32602` 대신 정상적인 `isError` 결과가 전달되는지 확인한다. `/health`, 429 통계 인증 경계와 기존 성공 도구 호출도 함께 확인한다.
