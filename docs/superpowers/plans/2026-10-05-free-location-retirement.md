# 무료 위치 검색 복구와 롯데마트 지원 중단 구현 계획

승인된 설계: personal-agent/projects/daiso-mcp/PROJECT.md의 2026 10 04 제안. Google과 Zyte는 다시 활성화하지 않습니다. 유료 API를 켜지 않습니다. 카카오 무료 자격과 활성화는 운영 검증 단계이며, 키 원문은 기록하지 않습니다.

## 1. 공통 무료 위치 변환

- [x] tests/freeGeocode.test.ts에서 주소·장소명, Kakao x/y 숫자변환, 이름/지역 일치, Naver 보완, 외부 HTTP 오류·timeout·429·빈/잘못된 결과, 키없음, 직접좌표 호출0회, Google/Zyte 호출0회를 검증합니다. 먼저 실패를 확인합니다.
- [x] src/utils/geocode.ts에 단일 목적 변환기를 구현합니다. 기존 fetchJson과 Naver normalize 패턴을 활용합니다. 주소는 Kakao address, 이름은 keyword. Naver는 이름 보완만 사용합니다. Google 키는 사용하지 않습니다. 외부 결과를 무조건 첫값으로 채택하지 않습니다. 데이터 영구DB나 별도 인프라를 추가하지 않습니다.
- [x] AppBindings와 Worker registry에서 KAKAO_REST_API_KEY·NAVER_CLIENT_ID/SECRET를 각 서비스로 주입하고 Worker의 process 접근을 안전하게 처리합니다. workflow 변경은 하지 않습니다.

## 2. 기존 서비스 연결과 거리검색

- [x] 기존 CU·GS25·오피넷·롯데시네마 위치 테스트를 무료변환 응답으로 바꾸고 실패를 먼저 확인합니다. 원래 입력/응답 필드를 유지합니다.
- [x] 메가박스 테스트에 부산 장소명, MCP Worker process 부재, 명시 좌표의 변환호출0회와 서울 기본값 오반환 금지를 추가합니다. 지역 선택은 원본 API 계약에 맞춥니다. 기존 무위치 기본서울 동작은 유지합니다.
- [x] CGV 테스트에 부산좌표 입력에서 전국 앞12개 서울후보를 고르지 않는 회귀를 추가합니다. 지역 후보/극장좌표 확보 후 거리정렬합니다. null좌표·거리 결과를 근처검색 성공으로 내보내지 않습니다.
- [x] src/services/{gs25,cu,cgv,megabox,lottecinema,opinet}와 각 API 핸들러·MCP도구의 Google 변환을 대체합니다. 필요시 작은 위치 옵션 타입을 추가합니다. 구글 설정은 deprecated 입력 호환성으로만 남길 수 있고 실제 호출은 금지합니다.

## 3. 롯데마트 지원 중단

- [x] tests/app/app-api-lottemart.test.ts(실제 기존 파일명 확인)와 registry/CLI/OpenAPI/health 테스트에서 retire 상태를 먼저 검증합니다. stores/products/debug는 HTTP410 + SERVICE_RETIRED, 외부 fetch0회입니다.
- [x] src/index.ts에서 롯데마트 MCP 등록을 제거하고 routes/lottemartRoutes.ts의 기존 URL을 tombstone으로 유지합니다. CLI 기존 명령은 명확한 지원중단 오류를 주며 기본 help에서 제외합니다. 소스 연구 기록은 삭제하지 않습니다.
- [x] README·공개 OpenAPI·프롬프트·health 목록에서 지원 표기를 제거합니다. 기존 테스트도 현재 계약으로 수정합니다. OpenAPI 생성 산출물은 npm run build로 갱신합니다.

## 4. 통합 검증과 전달

- [x] 각 대상 테스트, npm run check, npm run test:coverage(100%), npm run build와 npm audit를 실행하고 출력/종료코드를 확인합니다. src450줄 규칙을 지킵니다. 이전 braces high6은 별도 이슈로 구분합니다.
- [x] spec 리뷰 다음 품질 리뷰를 수행하고 지적사항을 해결합니다. 카카오 무료 앱 확인·유료설정 미활성 조건이 충족되면 실제 주소2건·역명3건과 지점거리·오피넷을 검증합니다.
- [ ] draft PR을 만들고 attach_artifact로 연결합니다. 현재 사용자 승인은 구현까지이며 main 머지·운영 배포는 별도 승인 전 수행하지 않습니다. 운영 설정 확인이 불가하면 구현은 계속 진행하고 정확한 남은 단계를 보고합니다.

## 구현 및 검증 증거

- CU 주소 검색의 기존 null 반환, 메가박스 부산역의 서울 대체, CGV 부산 좌표의 전국 앞 12개 후보, 롯데시네마 MCP 스키마의 서울 좌표 주입, 장소·주소 숫자 및 잘못된 응답형의 회귀를 실패로 확인한 뒤 수정했습니다.
- 공통 변환기는 주소 검색과 장소 검색을 구분하고 주소 숫자·지번 부번·지역·역 이름을 검증합니다. 잘못된 첫 결과를 건너뛰고 유효한 후속 결과를 선택합니다.
- 지역 후보는 가까운 Kakao CGV 장소를 공식 극장 목록에 연결하며 영구 좌표 데이터베이스는 추가하지 않습니다. 위치 해석 실패 시 영화관과 오피넷은 명확한 오류를 반환합니다.
- 카카오 앱 무료 일간 쿼터 활성화를 콘솔에서 확인했습니다. 실제 주소 2건·역명 3건, 부산 REST/MCP 영화관 조회와 명시 좌표 우선 사용, Google/Zyte 호출 0회를 검증했습니다.
- 로컬 OPINET 키는 없어 Kakao로 해석한 좌표를 기존 공개 오피넷 API에 전달해 HTTP 200과 주유소 9개를 확인했습니다. 새로운 키워드 경로를 운영에서 검증했다는 의미는 아닙니다.
- 운영 Worker에는 KAKAO_REST_API_KEY 설정이 필요합니다. 운영 키·배포·워크플로는 변경하지 않았습니다.
- 전체 테스트 207개 파일·2252개 테스트 통과, Statements/Branches/Functions/Lines 모두 100% 커버리지, 빌드 및 OpenAPI 갱신 완료.
- 승인 설계 및 품질 리뷰 지적 사항을 해결한 후 재검토를 통과했습니다. draft PR은 상위 에이전트에서 생성하고 연결합니다.
