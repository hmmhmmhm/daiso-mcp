# 서비스 복구 검증 계획

목표는 유료 대체 호출 없이 실제 조회를 복구하고, 운영 환경에서 효과를 확인한 변경만 반영하는 것입니다.

## 설계와 범위

기존 전송 계층의 최소 수정, 기존 브라우저 릴레이 연결, 신규 중계 확장 세 경로를 비교합니다. 우선 공개 API의 공식 요청 계약과 실제 응답을 비교하여 최소 수정을 적용합니다. 릴레이는 실행 가능한 호스트와 인증 경로가 확인되어야 연결할 수 있습니다. 단순 재시도나 빈 결과로 장애를 숨기지 않습니다.

CU와 CGV는 요청 헤더를 비교합니다. 디트릭스는 같은 요청의 로컬·Worker·포트별 응답을 비교합니다. GS25와 세븐일레븐은 로컬·Worker 차이를 기록합니다. 성공한 실측이 없는 후보는 반영하지 않습니다. 서비스별 세부 계획은 같은 폴더의 cu/cgv/dtryx-recovery 문서에 둡니다.

## 검증 절차

- [x] 최신 main에서 worktree 생성, npm ci 및 수정 전 전체 테스트 실행.
- [x] 운영 및 비공개 Cloudflare remote preview에서 실패를 재현.
- [x] 서비스별 실패 테스트를 먼저 실행하고, 최소 수정 후 관련 테스트 재실행.
- [x] Windows에서 실패하는 POSIX 전용 설치·프로세스 통합 검사를 플랫폼에 맞게 분리. OS 스냅샷 파서와 명령 호출은 모의 프로세스 결과로 모든 플랫폼에서 검증.
- [x] workflow 테스트의 LF/CRLF 처리를 정규화.
- [x] npm run check, npm run test:coverage, npm run build, npm audit 실행.
- [ ] 독립 리뷰 후 draft PR 생성. 운영 반영이 승인될 때 검증된 변경과 남은 장애를 구분하여 fresh 점검.

수정 전 결과는 scratch/daiso-recovery-baseline.log에 보존했습니다. POSIX /bin/ps, python3 및 pwd 의존성, CRLF 스크립트 추출 때문에 Windows에서 실패합니다. 타임아웃은 병렬 전체 실행 시 발생했으므로 개별 재실행 결과를 먼저 확인합니다.

최종 로컬 검증: npm run check 통과, 1,963개 테스트 통과 및 POSIX 전용 4개 명시적 생략. 커버리지 Statements/Branches/Functions/Lines 모두 100%, build 성공, audit 취약점 0건입니다. 독립 리뷰에서 필수 수정 사항은 없었습니다. Windows에서는 임시 인증 HTTP 릴레이를 통해 실제 nearby_store 재고 조회까지 성공했습니다.
