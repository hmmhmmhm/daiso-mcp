# 편의점 중계 분당 한도 개선 계획

**목표:** 사용자 요청에 따라 CU·GS25·세븐일레븐의 합산 원본 호출을 분당 69회, UTC 일일 최대 100,000회로 운영합니다.

**설계:** 기존 고정 분·UTC 일일 창과 원자적 파일 원장을 유지합니다. `69 × 1,440 = 99,360`이므로 분당 상한을 계속 채워도 하루 10만 회 이하입니다. `createFileQuota(path, now, limits)`의 세 번째 인자로 편의점 프로필만 선택하며, 기본 프로필은 기존 일일 3,000회·분당 30회입니다. 기존 사용량은 그대로 읽어 새 한도에서 차감합니다. 동시 접수·원본 동시성·캐시·진행 조회 병합·GS 인증은 변경하지 않습니다.

**기술:** Node/TypeScript/Vitest, 기존 Mac의 Dtryx+편의점 중계.

## 구현

- [ ] `tests/relay/quota.test.ts`: 편의점 동시 74요청 중69허용·재시작 후70번째 차단·다음분 재개를 RED로 확인.
- [ ] 같은 원장의 dayCount3,000을 초기화하지 않고 새 프로필로3,001까지 진행하는 회귀, dayCount99,999에서100,000까지만 허용·UTC 다음날 재개하는 회귀를 RED로 확인.
- [ ] `scripts/relay/quota.ts`: 기본 프로필과 `CONVENIENCE_QUOTA_LIMITS = { daily: 100000, minute: 69 }`를 정의하고 사용량 판정·상태 계산에 같은 프로필 적용.
- [ ] `scripts/relay/dtryx-start.ts`: 편의점 `createFileQuota(join(convenienceDir, 'quota.json'), Date.now, CONVENIENCE_QUOTA_LIMITS)`만 변경.
- [ ] 파일 원장과 실제 `createConvenienceRelay`를 묶어 캐시·공유 진행 요청은1회만 차감, 서로 다른 원본은분당한도로 차단하는 통합 회귀 확인.
- [ ] 편의점 운영 문서·GS 복구 runbook에 새 상한과 적용 범위를 갱신.

## 검증·배포

- [ ] 전체 check·커버리지100·build·npm audit0, 독립 리뷰 확인 후 한국어 커밋/PR·CI/CodeQL 성공·병합.
- [ ] Mac 중계의 `quota.ts`, `dtryx-start.ts`만 백업·소유 프로세스 종료 확인 후 교체·재기동. 실제 원장 파일을 초기화하거나 교체하지 않음.
- [ ] 기존 일일사용량3,000 보존, 새 편의점 잔여97,000 내외·분당69 및 Dtryx의 기존 잔여/한도 유지 확인.
- [ ] 기존 GS 정상 인증을 유지한 운영 CU·GS·Seven REST/MCP 조회와 Seven 서로 다른 페이지, 비교 실패 캐시·공개 CLI1.2.13 동작 검증. 요청 전 최신 quota 확인, 공유 일일 여유를 보존.
- [ ] 보고서와 PROJECT 최신 사실 갱신·작업 checkout 정리·완료 알림.

이 작업은 CLI 배포 파일에 포함되지 않는 중계 스크립트 변경입니다. 새 CLI 버전 게시 대신 운영 중계와 저장소 반영을 검증합니다. 날짜별 한도는 계속 UTC 자정(한국 시간 오전9시)에 갱신하며, 분당 한도는 정렬된 UTC 분 창입니다.
