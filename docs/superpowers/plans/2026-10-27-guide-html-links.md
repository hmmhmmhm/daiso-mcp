# 안내 페이지의 실제 링크 제공

ChatGPT 임시 대화에서 현재 안내27.2는 읽었지만 평문 `/browse/read`에 링크 ID가 없어 후속 click을 하지 못했다고 보고했다. 현재 서버 구현도 안내와 llms.txt를 같은 text/plain 응답으로 제공한다.

1. 현재 버전 안내의 Content-Type과 실제 HTML anchor를 기대하는 회귀를 먼저 추가한다. llms.txt 평문 계약은 별도 검사한다.
2. cloud CI에서 기존 text/plain이 기대 HTML과 달라 실패하는지 확인한다. 실패를 통과로 처리하지 않는다.
3. 버전 안내만 HTML로 바꾸고 웹 조회 시작, 최신 안내, 상세 사용법 링크를 실제 anchor로 제공한다. 텍스트 지침은 HTML escape하여 보존한다. llms.txt와 prompt, JSON API, CLI, 공개 MCP10도구는 유지한다.
4. 새 안내27.3을 문서와 기대값에 맞춘다. 전체 cloud CI·Coverage100%·Mac·CodeQL 및 독립 읽기 전용 리뷰를 수행한다.
5. 배포 후 실제 웹 도구와 기존 Chat 임시 대화에서 안내 링크→조회 시작→실제 상품 링크를 검증한다. Chat UI의 자체 보고와 원시 웹 도구 결과를 구분한다.

브라우저는 소유 탭1개만 사용한다. Chrome 본체 추가 생성, 공용 helper 종료, 자원 보호 우회, 로컬 전체 검사와 브라우저 실험 중첩은 하지 않는다.

RED: cloud Coverage40447456763에서 신규 HTML 검사만 실패했다. 기존 text/plain이 기대 text/html과 다르다는 실패를 확인한 뒤 구현했다. 4,152개 통과,1개 실패, Mac 전용1개 별도 검사였다.
