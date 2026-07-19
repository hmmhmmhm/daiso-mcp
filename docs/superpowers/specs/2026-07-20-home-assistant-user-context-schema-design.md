# Home Assistant `userContext` 스키마 호환성 설계

## 배경

Home Assistant 2026.7.1의 MCP 통합은 서버가 공개한 모든 도구의 JSON Schema를
`voluptuous-openapi==0.4.1`로 변환한다. 도구 하나라도 변환하지 못하면 서버 연결 전체를
거부한다.

`submit_developer_request`는 `userContext`에 `z.object({}).loose()`를 사용한다. Zod 4는 이를
`additionalProperties: {}`로 변환하지만, `voluptuous-openapi`는 빈 객체를 별도 스키마로
해석한 뒤 `type`이 없다는 오류를 반환한다. 운영 서버의 도구 40개를 같은 변환기로 검사한
결과 이 도구 하나만 실패했다.

## 목표

- Home Assistant 2026.7.1에서 도구 40개의 입력 스키마가 모두 변환되게 한다.
- `userContext`가 현재 허용하는 중첩 객체, 배열, `null`, 문자열, 정수, 실수, 불리언을
  계속 받을 수 있게 한다.
- `submit_developer_request`의 저장 처리와 다른 도구 스키마는 바꾸지 않는다.
- 같은 형태의 빈 `additionalProperties`가 다시 생성되면 단위 테스트에서 감지한다.

## 제외 범위

- Home Assistant나 `voluptuous-openapi` 자체는 수정하지 않는다.
- 공개 피드백 REST API와 Supabase 테이블 구조는 바꾸지 않는다.
- MCP 도구 목록, 도구 이름, 필수 입력 필드는 바꾸지 않는다.

## 대안 검토

### 1. 재귀 JSON 값 스키마 사용, 채택

`userContext`의 각 값에 문자열, 정수, 실수, 불리언, `null`, 배열, 객체를 명시한다. 배열과
객체는 같은 JSON 값 스키마를 재귀적으로 사용한다. Zod 4는 재귀 부분을 `$ref`로 표현하고,
Home Assistant가 고정한 `voluptuous-openapi==0.4.1`은 이 참조를 변환할 수 있다.

정수와 실수는 별도로 선언한다. `voluptuous-openapi`가 JSON Schema의 `number`를 Python
`float`로만 매핑하므로 `integer`가 없으면 `1` 같은 정수 입력을 거부하기 때문이다.

### 2. 원시 타입 record로 제한, 기각

문자열, 숫자, 불리언만 허용하면 설정 단계의 변환 오류는 사라진다. 그러나 기존에 받던
중첩 객체, 배열, `null`을 거부하고 정수 호환성도 완전히 해결하지 못한다.

### 3. `userContext` 제거, 기각

선택 필드이므로 서버 연결은 복구되지만 오류 재현 정보와 실행 환경을 함께 보내는 기존
기능을 잃는다.

## 구현

`src/services/feedback/tools/submitDeveloperRequest.ts`에 재귀 `jsonValueSchema`를 정의한다.
자기 참조 변수에는 명시적인 `z.ZodType<unknown>`을 사용해 TypeScript 추론 순환을 막는다.
`userContext`는 문자열 키와 `jsonValueSchema` 값을 갖는 record로 변경한다.

스키마 변경은 MCP 입력 검증에만 영향을 준다. 핸들러와 Supabase 저장 코드는 현재처럼
객체인 `userContext`를 그대로 저장한다.

## 테스트

- 실제 도구의 Zod 입력 스키마를 JSON Schema로 변환한다.
- `userContext.additionalProperties`가 빈 객체가 아니며 재귀 JSON 값 스키마를 가리키는지
  검사한다. 현재 구현에서 이 테스트가 실패하는 것을 먼저 확인한다.
- 같은 스키마가 중첩 객체, 배열, `null`, 정수, 실수, 불리언을 모두 검증하는지 확인한다.
- 대상 테스트를 통과시킨 뒤 전체 테스트, 100% 커버리지, 포맷, ESLint, Biome, 타입 검사와
  빌드를 실행한다.
- 배포 후 운영 `tools/list` 40개를 `voluptuous-openapi==0.4.1`로 다시 변환해 실패가 0개인지
  확인한다.

## 배포

검증된 커밋을 `main`에 푸시해 기존 GitHub Actions 배포를 실행한다. CI, Coverage, CodeQL,
Cloudflare 배포와 운영 헬스 체크가 끝난 뒤 실제 MCP 스키마를 다시 확인한다.
