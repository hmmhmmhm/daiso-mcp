# 첫 조회 속도 개선 계획

**Goal:** 글자별 웹 읽기 왕복을 통째 입력 링크로 줄이고 실제 Chat에서 전후 비교한다.

- [ ] tests/pages/browseQuick.test.ts에 실제 링크만 선택하는4페이지 흐름/임의상품ID 유지/메뉴 무원본호출/추천 불일치 입력 보존 회귀를 추가하고 RED 확인.
- [ ] src/pages/browseQuickLinks.ts에 상품/지역의 일반 입력 링크를 분리하고 browseComposer.ts·browse.ts·browseRead.ts에 통합. /browse/quick도 기존 읽기 세션 및 접수형 조회를 사용.
- [ ] 공통 agentStart·discovery·README·문서·Skill을 빠른 링크 우선으로 맞추고 현재버전 기대값 갱신. 불일치한 단어 대체·고정ID·가짜 수량 금지.
- [ ] 타입·450줄·빌드·회귀·Coverage100%·독립 리뷰·GitHub검사 후 병합·배포.
- [ ] 이전 질문과 같은 새 Chat 임시 대화2건을 순차 실행, 각 소유탭/캡처 정리. 실제 표시 수량과 API 대조, 원본캐시와 UI 전체시간 구분.
- [ ] 결과와 남은 한계를 PROJECT.md 및 연구 기록에 저장.
