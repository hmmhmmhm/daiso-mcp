#!/usr/bin/env bash
set -euo pipefail

# 세븐일레븐 API 리플레이 배치
# - 비인증(OPEN) 성공 가능한 엔드포인트를 우선 재현
# - RSA/인증 필요 엔드포인트를 함께 호출해 차단 원인 분류

BASE_URL="https://new.7-elevenapp.co.kr"
OUT_DIR=""
TIMEOUT=20
CONNECT_TIMEOUT=10
SUCCESS_ONLY_FROM=""

usage() {
  cat <<'USAGE'
사용법:
  scripts/seveneleven-open-replay-batch.sh [옵션]

옵션:
  --base-url <url>        기본값: https://new.7-elevenapp.co.kr
  --out <dir>             기본값: captures/seveneleven-replay-batch-YYYYmmdd-HHMMSS
  --timeout <sec>         기본값: 20
  --connect-timeout <sec> 기본값: 10
  --success-only-from <summary.tsv>
                           이전 실행의 HTTP 200 엔드포인트만 재실행
  -h, --help              도움말
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --connect-timeout)
      CONNECT_TIMEOUT="$2"
      shift 2
      ;;
    --success-only-from)
      SUCCESS_ONLY_FROM="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="captures/seveneleven-replay-batch-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "${OUT_DIR}/responses"

SUMMARY_TSV="${OUT_DIR}/summary.tsv"
SUMMARY_TXT="${OUT_DIR}/summary.txt"
SUMMARY_MD="${OUT_DIR}/summary.md"
INDEX_CSV="${OUT_DIR}/index.csv"
SUCCESS_NAMES_FILE="${OUT_DIR}/success-names.txt"

cat > "${INDEX_CSV}" <<'CSV'
name,method,path,category,note,body_file
common_code_app003,GET,/api/v1/common/common-code/APP003/,OPEN,앱 공통코드,
common_code_list_all,GET,/api/v1/common/common-code/list-all,OPEN,공통코드 전체,
product_pages,GET,/api/v1/product/pages,OPEN,상품 페이지,
product_subs,GET,/api/v1/product/subs,OPEN,상품 서브,
product_issues,GET,/api/v1/product/issues,OPEN,이슈 상품,
display_category_info,GET,/api/v1/display/category/info,OPEN,카테고리 정보,
display_category_low,GET,/api/v1/display/category/lowList,OPEN,카테고리 하위,
exhibition_main,GET,/api/v1/exhibition/main/list,OPEN,기획전 메인,
exhibition_list,GET,/api/v1/exhibition/list,OPEN,기획전 목록,
search_main_pop,GET,/api/v1/system/search-main-pop,OPEN,검색 메인 팝업,
search_user_notice,GET,/api/v1/system/search-user-notice-pop,OPEN,사용자 공지 팝업,
store_reviews,GET,/api/v1/store/reviews,OPEN,리뷰 목록,
store_reviews_score,GET,/api/v1/store/reviews/score/1,OPEN,리뷰 점수,
search_goods,POST,/api/v1/open/search/goods,OPEN,상품 검색,body_search_goods.json
search_popword,POST,/api/v1/open/search/popword?label=home,OPEN,인기 검색어,body_empty.json
search_ark,POST,/api/v1/open/search/ark?query=%EC%82%BC%EA%B0%81%EA%B9%80%EB%B0%A5,OPEN,자동완성,body_empty.json
search_recommend,POST,/api/v1/open/search/recommend?query=%EC%82%BC%EA%B0%81%EA%B9%80%EB%B0%A5,OPEN,추천 검색어,body_empty.json
open_stock_stores,POST,/api/v1/open/stock/search/stores,RSA,재고 매장검색(RSA 암호화 필요),body_stock_probe.json
stock_stores,POST,/api/v1/stock/search/stores,RSA,재고 매장검색(RSA 암호화 필요),body_stock_probe.json
setting,GET,/api/v1/setting,AUTH,설정(로그인 필요),
setting_device,GET,/api/v1/setting/device?osCd=android&osVer=15,AUTH,기기설정(로그인 필요),
reviews_writable,GET,/api/v1/store/reviews/my/writable,AUTH,내 리뷰 작성가능(로그인 필요),
CSV

cat > "${OUT_DIR}/body_empty.json" <<'JSON'
{}
JSON

cat > "${OUT_DIR}/body_search_goods.json" <<'JSON'
{
  "query": "삼각김밥",
  "sort": "recommend",
  "size": 20,
  "page": 1
}
JSON

cat > "${OUT_DIR}/body_stock_probe.json" <<'JSON'
{
  "goodsCd": "1111111111111",
  "storeCd": "000000",
  "lat": "37.5665",
  "lng": "126.9780"
}
JSON

request_once() {
  local idx="$1"
  local name="$2"
  local method="$3"
  local path="$4"
  local category="$5"
  local note="$6"
  local body_file="$7"

  local url="${BASE_URL}${path}"
  local req_body=""

  if [[ -n "${body_file}" ]]; then
    req_body="${OUT_DIR}/${body_file}"
  fi

  local prefix
  prefix=$(printf '%03d_%s' "${idx}" "${name}")
  local hdr="${OUT_DIR}/responses/${prefix}.hdr"
  local body="${OUT_DIR}/responses/${prefix}.body"

  local code
  if [[ "${method}" == "POST" ]]; then
    code=$(curl -sS \
      --max-time "${TIMEOUT}" \
      --connect-timeout "${CONNECT_TIMEOUT}" \
      -X POST "${url}" \
      -H 'accept: application/json, text/plain, */*' \
      -H 'content-type: application/json' \
      -H 'user-agent: Mozilla/5.0 (Linux; Android 15)' \
      --data-binary "@${req_body}" \
      -D "${hdr}" -o "${body}" -w '%{http_code}' || true)
  else
    code=$(curl -sS \
      --max-time "${TIMEOUT}" \
      --connect-timeout "${CONNECT_TIMEOUT}" \
      -X GET "${url}" \
      -H 'accept: application/json, text/plain, */*' \
      -H 'user-agent: Mozilla/5.0 (Linux; Android 15)' \
      -D "${hdr}" -o "${body}" -w '%{http_code}' || true)
  fi

  local bytes
  bytes=$(wc -c < "${body}" | tr -d ' ')
  local ct
  ct=$(rg -n '^content-type:' "${hdr}" -N | head -n 1 | sed 's/\r$//' | cut -d' ' -f2-)
  local hint=""
  local body_message=""
  local body_code=""

  if rg -q '"message":"' "${body}"; then
    body_message=$(rg -o '"message":"[^"]*"' "${body}" | head -n 1 | cut -d'"' -f4)
  fi
  if rg -q '"code":' "${body}"; then
    body_code=$(rg -o '"code":[0-9]+' "${body}" | head -n 1 | cut -d: -f2)
  fi

  if rg -q 'RSA 복호화 실패' "${body}"; then
    hint='rsa_decrypt_fail'
  elif [[ "${body_code}" == "503" ]]; then
    hint='service_unavailable'
  elif [[ "${code}" == "401" ]]; then
    hint='auth_required'
  elif [[ "${code}" == "405" ]]; then
    hint='method_not_allowed'
  elif [[ "${code}" == "000" ]]; then
    hint='network_error_or_timeout'
  elif [[ "${code}" == "200" ]]; then
    hint='ok'
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${idx}" "${name}" "${method}" "${code}" "${bytes}" "${category}" "${ct}" "${hint}" "${url}" \
    >> "${SUMMARY_TSV}"

  printf '[%02d] %s %s -> %s (%s bytes, %s)\n' \
    "${idx}" "${method}" "${path}" "${code}" "${bytes}" "${hint:-none}"
}

: > "${SUMMARY_TSV}"
selected_count=0

if [[ -n "${SUCCESS_ONLY_FROM}" ]]; then
  if [[ ! -f "${SUCCESS_ONLY_FROM}" ]]; then
    echo "이전 summary.tsv 파일을 찾을 수 없습니다: ${SUCCESS_ONLY_FROM}" >&2
    exit 1
  fi

  awk -F $'\t' '$4=="200"{print $2}' "${SUCCESS_ONLY_FROM}" | sort -u > "${SUCCESS_NAMES_FILE}"
  if [[ ! -s "${SUCCESS_NAMES_FILE}" ]]; then
    echo "이전 summary.tsv에서 HTTP 200 엔드포인트를 찾지 못했습니다." >&2
    exit 1
  fi
fi

idx=0
while IFS=',' read -r name method path category note body_file; do
  [[ "${name}" == "name" ]] && continue
  if [[ -n "${SUCCESS_ONLY_FROM}" ]]; then
    if ! rg -qx "${name}" "${SUCCESS_NAMES_FILE}"; then
      continue
    fi
  fi
  idx=$((idx + 1))
  selected_count=$((selected_count + 1))
  request_once "${idx}" "${name}" "${method}" "${path}" "${category}" "${note}" "${body_file}"
done < "${INDEX_CSV}"

if [[ "${selected_count}" -eq 0 ]]; then
  echo "실행 대상 엔드포인트가 없습니다." >&2
  exit 1
fi

column -t -s $'\t' "${SUMMARY_TSV}" > "${SUMMARY_TXT}" || cp "${SUMMARY_TSV}" "${SUMMARY_TXT}"

ok_count=$(awk -F $'\t' '$4=="200"{c++} END{print c+0}' "${SUMMARY_TSV}")
rsa_count=$(awk -F $'\t' '$8=="rsa_decrypt_fail"{c++} END{print c+0}' "${SUMMARY_TSV}")
auth_count=$(awk -F $'\t' '$8=="auth_required"{c++} END{print c+0}' "${SUMMARY_TSV}")
svc_unavail_count=$(awk -F $'\t' '$8=="service_unavailable"{c++} END{print c+0}' "${SUMMARY_TSV}")

{
  echo "# 세븐일레븐 리플레이 배치 결과"
  echo
  echo "- 실행시각: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "- base URL: ${BASE_URL}"
  echo "- 실행 요청: ${idx}"
  if [[ -n "${SUCCESS_ONLY_FROM}" ]]; then
    echo "- 실행 모드: success-only"
    echo "- 기준 파일: ${SUCCESS_ONLY_FROM}"
  else
    echo "- 실행 모드: full"
  fi
  echo "- HTTP 200: ${ok_count}"
  echo "- RSA 복호화 실패: ${rsa_count}"
  echo "- 인증 필요(401): ${auth_count}"
  echo "- 서비스 미사용/차단(503): ${svc_unavail_count}"
  echo
  echo "## 파일"
  echo "- summary.tsv"
  echo "- summary.txt"
  echo "- responses/*.hdr"
  echo "- responses/*.body"
  echo
  echo "## 해석"
  echo "- OPEN 카테고리에서 200이 확인된 엔드포인트는 즉시 리플레이 가능"
  echo "- RSA 카테고리는 앱 내부 암호화 페이로드 확보 전까지 재현 불가"
  echo "- AUTH 카테고리는 로그인 토큰/세션 확보 후 재시도 필요"
} > "${SUMMARY_MD}"

echo ""
echo "완료: ${OUT_DIR}"
echo "- ${SUMMARY_TSV}"
echo "- ${SUMMARY_TXT}"
echo "- ${SUMMARY_MD}"
