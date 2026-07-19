# Home Assistant README 지원 안내 설계

## 목표

- Daiso MCP가 Home Assistant의 Model Context Protocol 통합에서 사용할 수 있음을 README에
  명확히 표시한다.
- Home Assistant 사용자가 별도 조사 없이 서버 URL을 등록할 수 있게 한다.
- 실제로 검증한 버전과 공식 문서 링크를 함께 제공한다.

## 배치

`AI 앱에서 MCP 연결하기`의 Claude Code와 Grok 사이에 `Home Assistant` 전용 절을 추가한다.
이 위치는 앱별 연결 방법이 모인 구간이며 자동 호출량 그래프 갱신 범위 밖이므로, 차트
업데이트 스크립트가 내용을 덮어쓰지 않는다.

섹션 첫 문장도 `ChatGPT, Claude, Home Assistant, Grok` 순서로 고쳐 지원 앱 목록과 실제
하위 절을 일치시킨다. 상단 배지는 추가하지 않는다.

## 안내 내용

전용 절에는 다음 내용을 넣는다.

1. Home Assistant Core 2026.7.1에서 도구 40개의 연결 호환성을 확인했다는 안내
2. **Settings** → **Devices & services** → **Add Integration** 이동
3. **Model Context Protocol** 선택
4. 서버 URL `https://mcp.aka.page` 입력
5. 사용할 대화 에이전트에서 MCP 도구 활성화
6. Home Assistant의 공식 Model Context Protocol 통합 문서 링크

Home Assistant 공식 문서의 메뉴 이름은 영어 원문을 유지한다. README의 Claude 연결 안내와
같은 번호 목록과 존댓말을 사용한다.

## 검증

- `README.md`에 `Home Assistant`, `2026.7.1`, `https://mcp.aka.page`, 공식 문서 URL이 모두
  있는지 확인한다.
- Home Assistant 절이 `WORKERS_INVOCATIONS_CHART` 자동 갱신 구간 밖인지 확인한다.
- Prettier와 README 자동 갱신 관련 테스트를 실행한다.
