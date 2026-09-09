# 요청 수 집계 복구 기록

기존 차트는 매일 최근 30일을 다시 조회하면서 루트 GET 요청은 Cloudflare 보존기간인 최근 7일만 합산했습니다. 보존기간을 벗어난 날짜는 Worker 실행만 남았고, 경계 날짜는 하루의 일부 요청만 포함했습니다. 그 결과 서로 다른 기준의 날짜로 주간 증가율을 계산했습니다.

예를 들어 8월 31일은 당시 완전한 관측에서는 1,889,143건이지만 9월 9일 생성된 원래 파일에서는 142,067건으로 감소했습니다. 복구 전 표시된 주간 증가율 1,134.46%는 실제 트래픽 증가율로 해석할 수 없습니다.

## 복구 방법

`assets/analytics/workers-invocations.json`의 Git 이력을 조회했습니다. 각 날짜에 대해 관측 시각이 해당 KST 날짜의 종료 이후이고, `updatedAt - rootRequestsRetentionDays`가 해당 날짜의 시작 이전인 가장 최근 스냅샷을 선택했습니다. 같은 scriptName, metric, timezone, rootRedirect 설정의 기록만 사용했습니다. 현재 운영 계정은 Cloudflare 계정 API로 확인해 `accountId`에 기록했습니다.

8월 10일부터 9월 8일까지 30일 모두 완전한 관측을 찾았습니다. 복구한 파일에는 `coverageVersion: 1`을 부여했습니다. 이후 실행은 출처가 같은 완전한 기록을 보존하고, 관측할 수 없는 날짜에 믿을 수 있는 기록이 없으면 기존 산출물을 덮어쓰지 않고 실패합니다.

복구 후 최근 7일은 12,781,738건, 직전 7일은 12,474,864건으로 증가율은 약 2.46%입니다. 이 지표는 Worker 실행과 루트 GET 리디렉션 요청의 합계이며 사용자 수 또는 유료 원본 API 호출 수가 아닙니다. Cloudflare adaptive 집계의 관측값을 보존한 것으로 정확한 전수 로그를 복원한 것은 아닙니다.

아래 표는 복구된 날짜별 값과 원본 Git 커밋입니다. 커밋의 JSON에서 관측 시각과 설정을 확인할 수 있습니다.

| KST 날짜 | 요청 수 | 원본 커밋 |
|---|---:|---|
| 2026-08-10 | 2,482,869 | [1cb55e0](https://github.com/hmmhmmhm/daiso-mcp/blob/1cb55e07b57e73354baed1624ab4053ba41a9b40/assets/analytics/workers-invocations.json) |
| 2026-08-11 | 2,183,677 | [f775279](https://github.com/hmmhmmhm/daiso-mcp/blob/f7752791a0aa7cc996b984d13666f25d0a28faab/assets/analytics/workers-invocations.json) |
| 2026-08-12 | 2,443,491 | [deaa38a](https://github.com/hmmhmmhm/daiso-mcp/blob/deaa38a3dc845afc0f48e5e29e723478b5310bed/assets/analytics/workers-invocations.json) |
| 2026-08-13 | 2,595,363 | [917bd1a](https://github.com/hmmhmmhm/daiso-mcp/blob/917bd1aaa30c760e6e1379aae9b6f61bf8394b3f/assets/analytics/workers-invocations.json) |
| 2026-08-14 | 3,063,834 | [917bd1a](https://github.com/hmmhmmhm/daiso-mcp/blob/917bd1aaa30c760e6e1379aae9b6f61bf8394b3f/assets/analytics/workers-invocations.json) |
| 2026-08-15 | 2,370,520 | [d2b4c39](https://github.com/hmmhmmhm/daiso-mcp/blob/d2b4c399945a6dc6f6b4d7d9ec06c39a7dcfcf46/assets/analytics/workers-invocations.json) |
| 2026-08-16 | 2,018,530 | [638c7b8](https://github.com/hmmhmmhm/daiso-mcp/blob/638c7b8db2b85b98d139e79c94c30490713338b4/assets/analytics/workers-invocations.json) |
| 2026-08-17 | 1,273,637 | [ab4c11c](https://github.com/hmmhmmhm/daiso-mcp/blob/ab4c11c2c2d6a8a535f0966e67cd57e8b54c9047/assets/analytics/workers-invocations.json) |
| 2026-08-18 | 2,157,416 | [7d45f67](https://github.com/hmmhmmhm/daiso-mcp/blob/7d45f67af572932c509867224b7f29cef1d6efa4/assets/analytics/workers-invocations.json) |
| 2026-08-19 | 2,508,367 | [7df7c58](https://github.com/hmmhmmhm/daiso-mcp/blob/7df7c58109e09b10b8395e4116652a7d3bb3cf05/assets/analytics/workers-invocations.json) |
| 2026-08-20 | 2,533,868 | [d3cb49f](https://github.com/hmmhmmhm/daiso-mcp/blob/d3cb49f11e7538509329d2cfc98b94dd05550c71/assets/analytics/workers-invocations.json) |
| 2026-08-21 | 2,645,579 | [bd95adf](https://github.com/hmmhmmhm/daiso-mcp/blob/bd95adf7bb522cdc1705ebd4576f5b2ab4cbc753/assets/analytics/workers-invocations.json) |
| 2026-08-22 | 837,045 | [a791bd1](https://github.com/hmmhmmhm/daiso-mcp/blob/a791bd1e13bce8ddfa03330bc90def67e7f09c81/assets/analytics/workers-invocations.json) |
| 2026-08-23 | 872,927 | [60d3a1c](https://github.com/hmmhmmhm/daiso-mcp/blob/60d3a1c231bc3dc216fd76a66e67f8a3912dbc21/assets/analytics/workers-invocations.json) |
| 2026-08-24 | 2,281,357 | [4b03c55](https://github.com/hmmhmmhm/daiso-mcp/blob/4b03c5576f978fc17aa1b70ef81d81595b3a4eb7/assets/analytics/workers-invocations.json) |
| 2026-08-25 | 1,700,985 | [2a49b56](https://github.com/hmmhmmhm/daiso-mcp/blob/2a49b56247e764a50c3bcdeba4fc3026cec96f9b/assets/analytics/workers-invocations.json) |
| 2026-08-26 | 1,811,819 | [7471139](https://github.com/hmmhmmhm/daiso-mcp/blob/747113963fbf383c24abaaf9efffc5fb4a1d8585/assets/analytics/workers-invocations.json) |
| 2026-08-27 | 1,750,102 | [3404b8c](https://github.com/hmmhmmhm/daiso-mcp/blob/3404b8cd4bca760bf4db8dae81b4977e5a039026/assets/analytics/workers-invocations.json) |
| 2026-08-28 | 1,932,412 | [860c159](https://github.com/hmmhmmhm/daiso-mcp/blob/860c159adca11701f3245c485d6dde4c407c70e8/assets/analytics/workers-invocations.json) |
| 2026-08-29 | 1,990,954 | [c32aad0](https://github.com/hmmhmmhm/daiso-mcp/blob/c32aad0de93a7ca278de79bdcd94a42ffb17fe47/assets/analytics/workers-invocations.json) |
| 2026-08-30 | 1,250,744 | [13cb7b6](https://github.com/hmmhmmhm/daiso-mcp/blob/13cb7b6b7c2253974a2857a7cba049fdf5463c4e/assets/analytics/workers-invocations.json) |
| 2026-08-31 | 1,889,143 | [0566392](https://github.com/hmmhmmhm/daiso-mcp/blob/05663929907217c7d3d792a05358355dba14e85a/assets/analytics/workers-invocations.json) |
| 2026-09-01 | 1,849,690 | [1603076](https://github.com/hmmhmmhm/daiso-mcp/blob/16030767448043e242158fb927ad306ff3cc6589/assets/analytics/workers-invocations.json) |
| 2026-09-02 | 1,829,109 | [5f98b88](https://github.com/hmmhmmhm/daiso-mcp/blob/5f98b8867fafb758e9f2a0e008258b10941c5600/assets/analytics/workers-invocations.json) |
| 2026-09-03 | 1,838,457 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
| 2026-09-04 | 1,518,200 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
| 2026-09-05 | 1,406,113 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
| 2026-09-06 | 1,297,625 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
| 2026-09-07 | 2,071,954 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
| 2026-09-08 | 2,820,280 | [cc5ab53](https://github.com/hmmhmmhm/daiso-mcp/blob/cc5ab53456741c03fcaf39e7f254493754eced05/assets/analytics/workers-invocations.json) |
