# 웹 읽기 실험 진행 기록 (2026-10-27)

## 실제 상품 조회로 확장

PR335의 실험 Worker 배포40437090435가 성공했다. 별도 브라우저를 실행하지 않고 웹 도구의 실제 링크 ID만 선택했다.

1. PR335 본문의 실험 링크에서 새 실행 `d770a877-3a4c-4941-bad9-e22a0566f231`을 시작했다.
2. 초성·중성·완성 글자를 선택해 사전에 고정하지 않은 `연필`을 입력했다.
3. 입력 완료 요청 번호 `d9f88fd9-8eed-4aa7-b459-cf31dbcc4f3d`와 공개 관측 기록이 일치했다. 해당 실행은18개 이벤트가 있으며 첫 도착02:15:12.921 UTC, 완료 생성02:16:21.592 UTC였다. 경과에는 도구 호출·에이전트 작업 시간이 포함된다.
4. 완료 화면의 실제 상품 검색 링크를 click하자 `/browse/daiso/products/%EC%97%B0%ED%95%84/pageSize/3`이 실제 HTML을 반환했다. 응답 생성02:16:28.729 UTC, 투명 연필캡1034263·동물 모양 연필깎이1053585·전문가용2B연필58450을 확인했다.
5. 실제 상품58450 상세 링크도 click 성공, 응답 생성02:16:52.578 UTC였다. 상품 검색 성공이며 매장 재고 성공으로 확대하지 않는다.

같은 상품 검색 URL은 앞선 두 웹 도구의 직접 open 비교에서 모두 `URL ... is not accessible via this tool`이었다. 두 도구에서 example.com 대조군은 성공했다. 이름이 다른 커넥터를 고르는 것만으로 직접 open이 해결되지 않았다. 같은 백엔드를 사용하는지는 미확정이다.

실제 상품·상세 click 성공 후 같은 문자열 URL을 두 도구에서 다시 직접 open했으나 모두 동일한 접근 오류였다. 따라서 이번 실행에서 링크 click의 성공이 문자열 open이나 다른 도구의 접근 자격까지 바꾸지는 않았다. URL을 한 번 읽히게 해 캐시를 데우는 것만으로 해결됐다고 보지 않는다.

관측 JSON, 도구 비교와 UA 비교 원시 기록은 운영 기록의 `web-read-lab/2026-10-27/`에 보존했다. 생산 상품 응답에는 실험 Worker의 requestId를 넣지 않았으므로 생산 원본 fetch 시도와 직접 상관관계를 증명한 것은 아니다. HTML 응답 생성 시각은 원본 재고 갱신 시각이 아니다.

## 별도로 확인한 Cloudflare1010

동일한 synthetic URL에서 Python 기본 `Python-urllib/3.9`는 custom domain과 workers.dev 모두403/본문 `error code: 1010`이었다. curl UA와 ChatGPT 형태의 UA 문자열은200, 애플리케이션을 식별하는 `DAISO-MCP-WebReadLab/1.0`도200이었다. UA 문자열을 지정한 요청은 실제 OpenAI 클라이언트라는 증거가 아니다.

[Cloudflare 공식1010 문서](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)는 기본 Python UA가 Browser Integrity Check에 걸릴 수 있고, workers.dev의 관리 영역 차단은 자체 영역의 Security Events나 Worker 로그에 남지 않을 수 있다고 설명한다. 식별 가능한 앱 UA를 사용한 일반 HTTP 대조군이 필요하다. 이것만으로 실제 hosted open 실패의 원인을1010으로 확정하지 않는다. 이번 실행에서는 Cloudflare 보안 설정을 변경하지 않았다.

## 공식 문서와 공개 소스에서 확인한 범위

- [OpenAI 웹 검색 문서](https://developers.openai.com/api/docs/guides/tools-web-search)는 open_page와 live/cache 제어를 설명한다. 특정 URL의 접근 거절 결정 단계나 서버 도착을 보장하지 않는다.
- [Codex extension.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/web-search/src/extension.rs)는 live를 external_web_access=true, cached/disabled를false로 변환한다.
- [Codex tool.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/web-search/src/tool.rs)와 [search endpoint](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/search.rs)는 명령을 hosted alpha/search로 전송한다. 검사한 코드에서 해당 접근 오류 문자열은 발견하지 못했다. 공개 클라이언트 코드만으로 서버 내부 결정을 복원하지 않는다.
- [history.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/web-search/src/history.rs)는 최근 사용자 텍스트2건과 제한된 assistant 텍스트를 검색 요청에 포함한다. 이것이 이번 URL 실패의 원인이라는 증거는 없다.
- [독립 재현 질문53849](https://github.com/openai/codex/discussions/53849)도 URL별 성공 차이와 원본 로그 부재를 보고하지만 미답변 상태다. 이를 공식 원인 설명으로 사용하지 않는다.

## 11:48 KST 시점의 남은 작업

실제 상품 HTML의 재고 링크는 사용자 지역을 URL에 직접 추가하도록 요구한다. 따라서 지역도 링크로 입력하고 실제 상품 ID를 유지하는 운영 경로가 필요하다. 이 흐름의 실제 재고·진열 위치, 독립 실행 및 새 ChatGPT Chat 대화의 성공은 아직 검증하지 않았다. 오후2시 연구 목표는 계속 active이며 이번 결과만으로 완료 처리하지 않는다.


## 운영 링크 입력·읽기 세션 실험 (12:35 KST)

PR336과337을 검사·리뷰 후 병합하고 운영에 배포했다. 공개 도구10개와 기존 JSON API, 원본 API 캐시·한도·권한은 유지했다.

- 글자 링크로 `지갑`과 `안산`을 입력해 실제 상품1035676과 안산 매장3곳의 응답을 받았다. 수량은 전부null이며 품절이 아니다. 진열위치 응답도 성공했으나 hasLocation:false였다.
- 버전 없는 GitHub root는26.1, README blob은22.1, /guide/latest는21.3의 오래된 사본·리디렉션을 반환했다. GitHub의 새27.1 버전 쿼리 주소에서는27.1을 확인했다. 조회 주소가 같으면 no-store와 Crawled today도 최신성을 보장하지 않았다.
- 고정 수납박스 URL은00:44:16.978UTC의26.1 응답이었다. `/browse/read`에서 발급한 실제 링크의 세션3905f9b3-50da-4729-ae68-025b3d728cb1은03:31:01.678UTC의27.1 응답을 반환했다. 같은 링크를 다시 click하면 같은 시각이었다.
- 해당 응답의 새 링크를 click하자 세션3d475ecd-fd7b-48be-8125-9d2788fecfba와03:31:09.075UTC로 바뀌었다. 새 HTML 주소를 도구의 이전 수집본과 구분하는 효과를 관측했다. 원본 API 갱신을 증명하지는 않는다.
- 같은 세션의 상품1049516에서 글자 링크로 `강남`을 입력하고 재고를 조회했다. 첫 요청은TimeoutError, 한 번 재확인 후 성공했다. 강남역점11199는0, 강남세곡점41199는null, 강남구청역점10600은3이었다. 이어10600의 진열 위치 링크도 성공, zoneNo19·stairNo-2를 확인했다.
- 새 ID04e687c3-410c-451c-869a-b8df53e38729의 같은 재고 링크는 첫 click에 성공하고03:34:21.898UTC 응답을 반환했다. 각 경로의 캐시·네트워크·원본 지연을 분리해 인과관계를 확정한 것은 아니다. TimeoutError와 URL 접근 거절은 같은 오류로 취급하지 않는다.

새 주소도 웹 도구가 수집한 뒤에는 재사용될 수 있다. 새 응답 링크는 검증된 범위의 대안이며 모든 계정·도구에서의 최신성 보장은 아니다. 새 ChatGPT Chat UI의 독립 검증은 BrowserSkill 연결0개와 Computer Use 서버 시간 초과로 아직 미완료다. 브라우저를 반복 생성하지 않았다. 원시 관측은 운영 기록의 read-sessions-observations.json에 보존했다.
