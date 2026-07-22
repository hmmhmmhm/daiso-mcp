# Contributing Guide

이 문서는 `daiso-mcp` 저장소에 기여할 때 필요한 개발 환경, 작업 흐름, 품질 기준을 정리합니다.

## 사전 준비

- Node.js: `24.x` (`.nvmrc` 참고)
- npm: `11.x` (Node.js 24에 포함된 버전 사용 권장)

```bash
nvm use
npm ci
cp .env.example .env
```

`.env`에는 필요한 경우 `ZYTE_API_KEY`를 설정하세요.

## 개발 명령어

```bash
# 로컬 실행
npm run dev

# 포맷/린트/타입/테스트
npm run format:check
npm run lint
npm run typecheck
npm test

# 전체 검증
npm run check
```

## 브랜치 및 PR 규칙

- 기능/수정 단위로 브랜치를 분리하세요.
- PR 본문은 `.github/PULL_REQUEST_TEMPLATE.md`를 따라 작성하세요.
- 병합 전 CI(Format/Lint/Typecheck/Test/Build)가 모두 통과해야 합니다.

## 커밋 메시지 규칙

접두사는 영어, 메시지는 한국어를 사용합니다.

- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서 수정
- `refactor:` 리팩토링
- `test:` 테스트
- `chore:` 기타 설정/의존성 작업
- `ci:` CI/CD 변경

예시:

```text
feat: 올리브영 재고 조회 필터 옵션 추가
fix: 매장 검색 파라미터 검증 오류 수정
ci: PR 검증 워크플로우 추가
```

## 코드 작성 기준

- TypeScript `strict` 모드를 유지합니다.
- 비동기/외부 API 호출에는 에러 처리를 포함합니다.
- 주석은 한국어로 작성합니다.
- 파일 길이는 450줄 내외를 권장합니다.

예외:

- `src/pages/openapi.ts`는 OpenAPI 생성 로직 특성상 길어질 수 있습니다.
- 길이가 커지는 파일은 기능 단위 모듈 분리를 우선 검토하세요.

## 테스트 원칙

- 새 기능에는 테스트를 함께 추가하세요.
- 정상 케이스와 에러/엣지 케이스를 함께 검증하세요.
- 외부 API 의존 로직은 가능한 한 mock 기반으로 테스트하세요.

## 보안 주의사항

- API 키, 토큰, 비밀번호, 개인정보를 커밋하지 마세요.
- `.env`, `.env.*`, `.dev.vars`는 커밋 금지입니다.
- 보안 이슈는 공개 이슈가 아니라 [SECURITY.md](./SECURITY.md) 절차를 따라 제보하세요.
