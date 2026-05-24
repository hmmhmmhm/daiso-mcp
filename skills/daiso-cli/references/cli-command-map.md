# Daiso CLI Command Map

Use `--json` for structured output. In shell commands, quoted Korean strings are fine for values with spaces. URL-encode spaces and Korean only when writing raw URLs outside the CLI.

## Agent Request Recipes

- "콜라 어디가 싸?": `npx daiso compare 콜라 --json`
- "강남역 근처 카페": `npx daiso places 강남역 --category cafe --json`
- "성수동 브런치 음식점": `npx daiso places 성수동 --keyword 브런치 --json`
- "다이소 핫식스 재고": search Daiso first, then run Daiso inventory if a product ID exists. Suggest convenience stores only after no Daiso result.
- "GS25 강남 오감자 재고": search product candidates when needed, then run `npx daiso gs25-inventory 오감자 --storeKeyword 강남 --json`
- "오늘 강남 CGV 시간표": compute today in KST as `YYYYMMDD`, find theater code if needed, then call CGV timetable.
- "올리브영 재고 도구 오류를 개발자에게 알려줘": `npx daiso get /api/feedback/requests --type bug --title "올리브영 재고 오류" --description "재고 조회가 실패합니다." --service oliveyoung --toolName oliveyoung_check_inventory --json`
- Failure rule: retry once with narrower input, then report the failing service and command.

## Daiso

- Product search: `npx daiso products 수납박스 --json`
- Product detail: `npx daiso product 1034604 --json`
- Store search: `npx daiso stores 강남역 --limit 10 --json`
- Inventory: `npx daiso inventory 1034604 --keyword 강남역 --json`
- Product-name inventory flow: run product search, ask for location if missing, select the product ID, then run inventory.
- Display location: `npx daiso display-location 1034604 04515 --json`

## Compare

- Cross-service price candidates: `npx daiso compare 콜라 --limit 3 --json`
- Narrow comparison services: `npx daiso compare 컵라면 --services seveneleven,emart24 --json`
- Note: compare uses existing product search without a new external API key. Confirm actual stock or store-specific sale prices with service-specific inventory or product endpoints.

## Nearby Places

- Cafes near a place: `npx daiso places 강남역 --category cafe --limit 5 --json`
- Restaurants near a place: `npx daiso places 강남역 --category restaurant --limit 5 --json`
- Specific food or mood: `npx daiso places 성수동 --keyword 브런치 --limit 5 --json`
- Note: this uses Naver Local keyword search, not exact coordinate radius search.

## Developer Requests

- Submit MCP bug: `npx daiso get /api/feedback/requests --type bug --title "올리브영 재고 오류" --description "oliveyoung_check_inventory가 빈 결과를 반환합니다." --service oliveyoung --toolName oliveyoung_check_inventory --json`
- Submit feature request: `npx daiso get /api/feedback/requests --type feature --title "행사가 비교" --description "compare가 행사 가격도 비교하면 좋겠습니다." --service compare --json`
- Note: `title` and `description` are required. Prefer the MCP tool `submit_developer_request` when the host app exposes MCP.

## Convenience Stores

- CU stores: `npx daiso cu-stores 강남 --json`
- CU inventory: `npx daiso cu-inventory 과자 --storeKeyword 강남 --json`
- GS25 stores: `npx daiso gs25-stores 강남 --limit 10 --json`
- GS25 products: `npx daiso gs25-products 콜라 --limit 20 --json`
- GS25 inventory: `npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 10 --json`
- Seven-Eleven products: `npx daiso seveneleven-products 삼각김밥 --size 20 --json`
- Seven-Eleven stores: `npx daiso seveneleven-stores "안산 중앙역" --limit 10 --json`
- Seven-Eleven inventory: `npx daiso get /api/seveneleven/inventory --keyword 핫식스 --storeKeyword "안산 중앙역" --storeLimit 10 --json`
- Seven-Eleven popular searches: `npx daiso seveneleven-popwords --label home --json`
- Seven-Eleven catalog: `npx daiso seveneleven-catalog --includeIssues true --includeExhibition true --limit 10 --json`
- Emart24 stores: `npx daiso emart24-stores 강남 --service24h true --json`
- Emart24 products: `npx daiso emart24-products 커피 --pageSize 20 --json`
- Emart24 inventory: `npx daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015 --json`

## Marts And Olive Young

- Lotte Mart stores: `npx daiso lottemart-stores 잠실 --area 서울 --limit 10 --json`
- Lotte Mart products: `npx daiso lottemart-products 콜라 --storeName 강변점 --area 서울 --json`
- Olive Young products: `npx daiso get /api/oliveyoung/products --keyword 선크림 --size 10 --json`
- Olive Young stores: `npx daiso get /api/oliveyoung/stores --keyword 명동 --limit 10 --json`
- Olive Young inventory: `npx daiso get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --json`

## Cinemas

- Megabox theaters: `npx daiso get /api/megabox/theaters --keyword 강남 --limit 10 --json`
- Megabox movies: `npx daiso get /api/megabox/movies --theaterId <theaterId> --json`
- Megabox seats: `npx daiso get /api/megabox/seats --theaterId <theaterId> --movieId <movieId> --playDate <YYYYMMDD> --json`
- Lotte Cinema theaters: `npx daiso lottecinema-theaters 잠실 --limit 10 --json`
- Lotte Cinema movies: `npx daiso get /api/lottecinema/movies --theaterId <theaterId> --json`
- Lotte Cinema seats: `npx daiso get /api/lottecinema/seats --theaterId <theaterId> --movieId <movieId> --playDate <YYYYMMDD> --json`
- CGV theaters: `npx daiso get /api/cgv/theaters --keyword 강남 --limit 10 --json`
- CGV movies: `npx daiso get /api/cgv/movies --playDate <YYYYMMDD> --theaterCode <theaterCode> --json`
- CGV timetable: `npx daiso get /api/cgv/timetable --playDate <YYYYMMDD> --theaterCode <theaterCode> --json`
- Cinema date rule: use today in KST as `YYYYMMDD` when the user says today or omits the date.

## Diagnostics

- Health: `npx daiso health`
- MCP URL: `npx daiso url`
- Help: `npx daiso help`
- Command help: `npx daiso help products`
