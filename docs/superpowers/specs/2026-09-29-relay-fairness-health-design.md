# 요청 집중 완화와 헬스체크 복구

## 근거

1.2.6 배포 이후 OY 릴레이429392건은 모두 분당30회 상한이며, 상품검색에387건 집중됐다. 캐시hit33건,50387건,upstream실패2건. 현재health 정상이나 burst가 공용quota/queue를 점유한다. 최신GitHub검사는CGV 원본403만 fail; Mac 및 두 Worker주소에서 cache-bust 조회는 현재정상이다. quick재시도는 같은5분summary캐시를 재사용한다.

## 승인된 개선 방향

- 글로벌30/min·3000/UTCday 유지. OY 신규 upstream 실행은 익명 소비자별12/min, 동시미완료2로 제한. inventory최대12fanout예산을 허용하고 독점적burst가공용8슬롯을채우는것을막는다. 캐시hit/coalesced에는 소비자 사용량을 차감하지 않는다. 제한응답은정상적인보호동작으로남으며모든429제거를약속하지않는다.
- Worker는 Cloudflare client identity를 요청컨텍스트로 전달하고 relayToken을 키로 UTCday별HMAC 식별자를 만든다. 교차존Worker의공통IP는기존일일제한과같은CF-Worker기준을사용. 클라이언트가보낸consumer헤더는신뢰하지않음. 원문IP/식별자로그미기록. CLI/이전Worker는legacy버킷. 소비자표는고정크기/만료로메모리제한.
- 릴레이 minute/daily/consumer 제한과 retryAfter를 ServiceError/REST Retry-After/MCP diagnostics까지보존. Worker전송은검증된429에한해재시도기한동안bounded cooldown 적용. global과consumer차단scope를구분하고403/5xx/잘못된headers는휴지로저장하지않음. 빠른재시도로Mac을두드리는현상을줄임.
- 캐시 hit/miss 및 만료 정리·용량 퇴출 횟수를 원문/키 없이 집계한다. 개별 miss 원인 추적용 별도 기록은 만들지 않는다. 기존256항목16MiB캐시와디스크안전로그경계유지.
- 헬스체크CGV는정확한CGV_UPSTREAM_UNAVAILABLE + upstream403인경우에만degraded. 401/5xx/timeouts/parse/auth오류는fail. 원본정보를구조화진단에보존하며CLI계약검사에도일관적용.
- GitHub재검사는fresh=true+명시적forceheader로이전summary를피하고curl실패시기존파일을읽지않음. 네트워크/전체실행timeout,엄격한JSON요약검증,매실행원본JSON/요약artifact보존. 0검사/잘못된payload가성공으로처리되지않도록함. 알려진서비스제한은degraded상태와세부내용을보고하며전체복구로표현하지않음.
- 전체check/build/100%coverage,독립검토,PR/CI/Worker+Mac배포,수동GitHubworkflow실행으로검증. Zyte사용안함.
