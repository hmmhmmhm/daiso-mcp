# 조회 경로의 주기적 판정

사용자가 직접 실패 시에만 중계를 쓰는 구조와 시간 단위 별도 점검을 승인했다. 매 사용자 요청에서 상태를 시험하지 않고, 저장된 판정으로 즉시 경로를 고른다.

Cloudflare scheduled는5분마다20개 조회 종류의 직접 API와3개 중계health를 점검한다. GS25 stock은 맥의 정상 로그인 세션을 사용하므로 직접 후보에서 제외하고 중계 유지. 점검은 사용자 조회/캐시를 통해 실행하지 않는다. 직접 점검은 같은 URL·헤더·본문·검증으로 수행하고 상품과 상세재고를 별도 판정한다. 고정 대표 상품/매장만 사용하며 최대3초·2MiB·재시도0, 병렬4, 모든 필드 오류는 실패로 본다. HTTP200의 빈 오류 HTML이나 비정상JSON을 성공/재고0으로 취급하지 않는다. 점검의 상한은19직접*288/일과3health*288/일이며 중계health는원장을 차감하지 않는다.

UpstreamRouteHealth SQLite DurableObject가 공유 판정을 영속화한다. 새 binding UPSTREAM_ROUTE_HEALTH와 migration v2. 상태는 key별 direct/checkedAt/failedAt/blockedUntil, 중계그룹별healthy/checkedAt로 구성한다. 실패의5분 cooldown은 나중에 도착한 오래된 probe 성공이 해제하지 못하게 한다. 스냅샷10분 초과는 직접 성공 근거로 사용하지 않는다.

Worker request context는 AsyncLocalStorage로 분리. isolate에는 namespace별 짧은 immutable snapshot cache만 둔다. 상태가없음/30초지난경우 사용자요청은 기다리지 않고 relay를 선택하며 waitUntil에서 DO snapshot만 갱신한다. 실시간 upstream health probe는 scheduled/admin만 수행한다. namespace가없는 기존 설치/로컬은 기존 relay 우선 유지. 새context없는 transport도 기존동작.

알려진 직접 경로를 선택한 뒤 예상치 못한403/401/429/5xx·network·shape 실패 시 직접을 즉시5분 차단하고 원래 총시간예산 안에서 중계로1회 복구한다. 정상적인400/404/422나 사용자취소는 경로장애로 판단하지 않는다. 동일 실패는비동기로DO에 전달한다. 직접/중계 모두 최근점검에서 불가하면503으로명확히실패. quota429는 중계가 죽었다는 의미로 사용하지 않는다.

공통 transport단계에서만 routing을 연결해REST/MCP/CLI·비교조회에동일하게적용한다. 편의점 requestConvenienceRelay, Dtryx requestDtryxRelay, OY requestOliveyoung의 relaybranch를 감싼다. 직접요청은공통requestDirectRoute를 사용하며 relay헤더/토큰은공식API에전달하지않는다. 기존 인증·quota·캐시와 브라우저없는OY중계 유지, Google/Zyte 재활성 없음.

API /api/health/routes GET은 기존운영secret으로snapshot조회, POST는명시적수동점검. frontend의 상품조회흐름에는운영진단정보를추가하지않는다. Cron5분 설정/실제Cloudflare직접probe·운영다른서비스·fallback주입·동시coldstart·stale·crossisolate race를검증하고PR/CI/병합/배포/CLI릴리스까지완료한다.
