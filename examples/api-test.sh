#!/bin/bash

# Daiso MCP API 테스트 스크립트
# 사용법: ./api-test.sh [API_URL]
# 예시: ./api-test.sh http://localhost:8787
#      ./api-test.sh https://your-worker.workers.dev

API_URL=${1:-"http://localhost:8787"}

echo "================================"
echo "Daiso MCP API 테스트"
echo "API URL: $API_URL"
echo "================================"
echo ""

# 1. 서버 정보 조회
echo "1. 서버 정보 조회"
echo "GET $API_URL/"
curl -s "$API_URL/" | jq '.'
echo ""
echo ""

# 2. 도구 목록 조회
echo "2. 도구 목록 조회"
echo "GET $API_URL/tools"
curl -s "$API_URL/tools" | jq '.tools[] | {name, description}'
echo ""
echo ""

# 3. 제품 검색
echo "3. 제품 검색 - '수납박스' 검색"
echo "POST $API_URL/execute"
curl -s -X POST "$API_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{"name":"search_products","arguments":{"query":"수납박스"}}' | jq '.'
echo ""
echo ""

# 4. 매장 찾기
echo "4. 매장 찾기 - 서울 시청 근처"
echo "POST $API_URL/execute"
curl -s -X POST "$API_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{"name":"find_stores","arguments":{"latitude":37.5665,"longitude":126.9780,"radius":5}}' | jq '.'
echo ""
echo ""

# 5. 재고 확인
echo "5. 재고 확인 - 강남점(S001)의 수납박스(P001)"
echo "POST $API_URL/execute"
curl -s -X POST "$API_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{"name":"check_inventory","arguments":{"storeId":"S001","productId":"P001"}}' | jq '.'
echo ""
echo ""

# 6. 가격 정보 조회
echo "6. 가격 정보 조회 - 볼펜 10입(P002)"
echo "POST $API_URL/execute"
curl -s -X POST "$API_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{"name":"get_price_info","arguments":{"productId":"P002"}}' | jq '.'
echo ""
echo ""

echo "================================"
echo "테스트 완료!"
echo "================================"
