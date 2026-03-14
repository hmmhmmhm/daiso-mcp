#!/usr/bin/env bash
set -euo pipefail

# 세븐일레븐 WebView 캐시 JS에서 API 경로를 추출하고 GET 프로브를 수행한다.
#
# 입력:
# - --extracted <dir>: seveneleven-cache-replay-extract.sh --keep-extracted 결과의 extracted 디렉토리
# - --base-url <url>: API base URL (기본값: https://new.7-elevenapp.co.kr)
# - --out <dir>: 출력 디렉토리

EXTRACTED_DIR=""
BASE_URL="https://new.7-elevenapp.co.kr"
OUT_DIR=""

usage() {
  cat <<'EOF'
사용법:
  scripts/seveneleven-js-api-paths-extract.sh \
    --extracted <extracted_dir> \
    [--base-url https://new.7-elevenapp.co.kr] \
    [--out captures/seveneleven-js-api-probe-YYYYmmdd-HHMMSS]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extracted)
      EXTRACTED_DIR="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
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

if [[ -z "${EXTRACTED_DIR}" ]]; then
  echo "--extracted는 필수입니다." >&2
  usage
  exit 1
fi

if [[ ! -d "${EXTRACTED_DIR}" ]]; then
  echo "extracted 디렉토리를 찾을 수 없습니다: ${EXTRACTED_DIR}" >&2
  exit 1
fi

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="captures/seveneleven-js-api-probe-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_DIR}"

RAW_MATCHES="${OUT_DIR}/raw-matches.txt"
API_PATHS="${OUT_DIR}/api-paths.txt"
API_URLS="${OUT_DIR}/api-urls.txt"
PROBE_TSV="${OUT_DIR}/probe-summary.tsv"
PROBE_TXT="${OUT_DIR}/probe-summary.txt"

echo "[1/4] JS/Cache에서 API 패턴 추출"
rg -a -n -o '/api/v[0-9]/[A-Za-z0-9_./?-]*' "${EXTRACTED_DIR}" \
  | sed 's/[",)\\]><]*$//' \
  > "${RAW_MATCHES}" || true

cut -d: -f3- "${RAW_MATCHES}" \
  | sed 's#///*#/#g' \
  | sed 's/[?&]$//' \
  | awk '{ sub(/\[.*/, "", $0); print }' \
  | sed '/^$/d' \
  | sort -u > "${API_PATHS}"

echo "[2/4] base URL 결합"
awk -v base="${BASE_URL}" '{ print base $0 }' "${API_PATHS}" > "${API_URLS}"

echo "[3/4] GET 프로브"
: > "${PROBE_TSV}"
idx=0
while IFS= read -r url; do
  [[ -z "${url}" ]] && continue
  idx=$((idx + 1))
  hdr="${OUT_DIR}/header-${idx}.txt"
  body="${OUT_DIR}/body-${idx}.txt"
  code=$(curl -sS --max-time 20 --connect-timeout 10 \
    -H 'accept: application/json, text/plain, */*' \
    -H 'user-agent: Mozilla/5.0 (Linux; Android 15)' \
    -D "${hdr}" -o "${body}" -w '%{http_code}' "${url}" || true)
  bytes=$(wc -c < "${body}" | tr -d ' ')
  ct=$(rg -n '^content-type:' "${hdr}" -N | head -n 1 | sed 's/\r$//' | cut -d' ' -f2-)
  printf "%s\t%s\t%s\t%s\t%s\n" "${idx}" "${code}" "${bytes}" "${ct}" "${url}" >> "${PROBE_TSV}"
done < "${API_URLS}"

column -t -s $'\t' "${PROBE_TSV}" > "${PROBE_TXT}" || cp "${PROBE_TSV}" "${PROBE_TXT}"

echo "[4/4] 완료"
echo "산출물:"
echo "- ${RAW_MATCHES}"
echo "- ${API_PATHS}"
echo "- ${API_URLS}"
echo "- ${PROBE_TSV}"
echo "- ${PROBE_TXT}"
