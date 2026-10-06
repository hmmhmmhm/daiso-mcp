# 주기적 경로 선택 구현 계획

**Goal:** 사용자 조회의 시험 호출 지연을 제거하고 검증된 직접 경로만 사용한다.
**Architecture:** Cron probes → DurableObject snapshot → request-local cached decision → direct 또는 relay. 실패는 cooldown과 단일 fallback.
**Tech Stack:** Workers scheduled/waitUntil, SQLite DO, AsyncLocalStorage, 기존fetchJson/ServiceError/Zod/Vitest.

- [ ] src/utils/routeHealth.ts 및 src/durableObjects/upstreamRouteHealth.ts를 테스트먼저 구현. cold/stale/namespace격리/nohotIO/후속실패/오래된probe/취소/시간예산/400보존. 계약은 아래와 같다.
- [ ] src/utils/directRoutes.ts, directRouteSpecs*.ts 및 src/utils/routeProbes.ts를 테스트먼저 구현. 고정20operation URL/method/payload/스키마/headers; GSstockpinned;19direct+3health 최악제한. 실제Workerprobe증거저장.
- [ ] 기존공통transport3곳에 routeOperation(key,timeout,direct,relay,signal?) 연결하고 모든클라이언트branch가 이 경로를 사용하는지 확인. 새binding없으면기존relay순서 유지.
- [ ] index.ts worker fetch context와scheduled, wrangler v2DO/Cron5분, AppBindings와인증된health route GET/POST 연결. index450줄 유지.
- [ ] npm run check; npm run test:coverage; npm run build; npm audit 및 독립요구사항/품질리뷰. 기능·schema실패가재고0으로반환되지않는회귀포함.
- [ ] PR/CI확인후병합·배포. 기존Macruntime·인증·원장은변경없음. 운영수동warm/probe와실제scheduled관측, REST/MCP/게시CLI 및state cache지연검증.
- [ ] 변경된Worker/CLIpackage를patch릴리스하고공식tarballgitHead/무결성검증. 운영기록/설계제약·실측·복구절차와완료알림.

## 병렬 모듈 계약

routeHealth.ts exports ROUTE_KEYS(oy-find-store,oy-product-search,oy-goods-info,oy-stock-stores,cu-prime,cu-stock,cu-store,gs25-products,gs25-stock,seven-goods,seven-store,seven-popwords,seven-stock-meta,seven-stock,seven-pages,seven-issues,seven-exhibitions,dtryx-movies,dtryx-play-dates,dtryx-timetable), RouteKey, RelayGroup=oliveyoung/convenience/dtryx.
RouteCheck={key,direct:boolean,checkedAt:number,reason?:string}; RelayCheck={group,healthy:boolean,checkedAt,reason?}. RouteSnapshot={routes:Partial<Record<RouteKey,RouteCheck&{failedAt?,blockedUntil?}>>,relays:Partial<Record<RelayGroup,RelayCheck>>}.
withRouteRouting<T>(namespace:DurableObjectNamespace|undefined,waitUntil:((p:Promise<unknown>)=>void)|undefined,work:()=>T):T.
routeOperation<T>(key:RouteKey,budgetMs:number,direct:(ms:number)=>Promise<T>,relay:(ms:number)=>Promise<T>,signal?:AbortSignal):Promise<T>.
readRouteSnapshot(namespace):Promise<RouteSnapshot>; writeRouteChecks(namespace,checks:RouteCheck[],relays:RelayCheck[]):Promise<void>.
DO internal GET/snapshot; POST/checks {checks,relays}; POST/failure {key,at}. metadata-only,no tokens. Coreagent owns core/DO+theirtests; probeagent owns specs/directRoutes/routeProbes+theirtests; root owns existingtransports/index/bindings/wrangler/healthroute/docs/tests integration. No agent deploys/commits/restarts.
