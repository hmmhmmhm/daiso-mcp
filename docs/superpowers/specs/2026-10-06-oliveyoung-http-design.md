# 올리브영 브라우저 없는 맥 중계

목표: 기존 상품·매장·상세·매장재고 계약을 유지하며 브라우저 없는 실행을 지원한다.

실측: 같은 맥의 Python3 urllib는 쿠키 없이 네 API SUCCESS, Node fetch/https와 curl은 403. 최소 헤더는 Python도 403. 헤더가 필요하며 HTTP 클라이언트에 따라 차이가 있다. TLS만 원인이라고 확정하지 않는다.

선택: 기존 Mac 중계의 수송만 Python 표준 HTTP 클라이언트로 교체하는 명시적인 OY_RELAY_TRANSPORT=http 옵션. 기본 browser는 유지하여 기존 설치 호환 및 롤백 제공. 자동 브라우저 fallback은 하지 않는다. Worker 직접 전환은 같은 환경 검증 근거가 부족하고, 자동 fallback은 브라우저 제거 목표를 충족하지 않는다.

Node가 고정 Python helper를 실행한다. 외부 Python 패키지·쿠키·개인 프로필 없음. 고정 origin과 네 path만 허용, HTTP200/SUCCESS 및 객체 data만 허용. 리다이렉트 거부, 응답2MiB/네트워크15초/프로세스18초 상한. 비밀 환경 변수를 자식에게 전달하지 않는다. 오류는 재고0이 아닌 기존502로 반환한다.

start.ts는 mode에 맞는 lifecycle을 선택하고 HTTP일 때 브라우저 모듈을 로드하지 않는다. 기존 인증/캐시/coalescing/직렬처리/원장/한도/로그는 유지한다. health는 transport/http, pages0, browserRequiredfalse 및 상태를 표시한다. 실행 Python 경로는 OY_HTTP_PYTHON으로 지정한다.

검증: Python helper의 allowlist/redirect/status/envelope/size/error를 오프라인 fixture로 테스트하고 Node 실행·상태·종료를 검증. 실환경 네 API3회 및 상품2종의 실제 매장재고를 기존 브라우저와 대조. 전체 check/coverage100/build/audit 통과 후 PR 병합, 맥 runtime 백업·원장 보존·종료 확인 후 http 모드 전환. REST/MCP/게시CLI/health 및 소유 브라우저 없음 확인. 장기 차단 없음은 보장하지 않는다.
