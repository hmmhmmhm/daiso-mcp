#!/usr/bin/env bash
set -euo pipefail

# 세븐일레븐 앱 캐시 기반 리플레이 URL 추출기
# - 루팅 기기에서 앱 데이터 일부를 tar로 가져와 로컬에서 문자열 분석
# - API URL 후보와 curl 템플릿을 자동 생성

PACKAGE="kr.co.kork7app"
OUT_DIR=""
KEEP_EXTRACTED="false"

usage() {
  cat <<'EOF'
사용법:
  scripts/seveneleven-cache-replay-extract.sh [옵션]

옵션:
  --package <패키지명>    기본값: kr.co.kork7app
  --out <출력디렉토리>    기본값: captures/seveneleven-cache-replay-YYYYmmdd-HHMMSS
  --keep-extracted        추출된 임시 디렉토리(extracted/) 유지
  -h, --help              도움말 출력
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --keep-extracted)
      KEEP_EXTRACTED="true"
      shift 1
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
  OUT_DIR="captures/seveneleven-cache-replay-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "${OUT_DIR}"
TMP_DIR="${OUT_DIR}/extracted"
mkdir -p "${TMP_DIR}"

RAW_TAR="${OUT_DIR}/appdata.tar"
ALL_URLS="${OUT_DIR}/all-urls.txt"
API_URLS="${OUT_DIR}/api-urls.txt"
SEVEN_URLS="${OUT_DIR}/seveneleven-urls.txt"
CURL_TMPL="${OUT_DIR}/replay-curl-templates.sh"
SUMMARY="${OUT_DIR}/summary.txt"

echo "[1/6] adb 연결 확인"
adb get-state >/dev/null

echo "[2/6] 루트 권한 및 패키지 경로 확인"
adb shell "su -c 'test -d /data/data/${PACKAGE}'"

echo "[3/6] 앱 데이터(캐시/웹뷰/설정) tar 덤프"
adb exec-out "su -c 'tar -C /data/data/${PACKAGE} -cf - cache app_webview shared_prefs files 2>/dev/null'" \
  > "${RAW_TAR}"

if [[ ! -s "${RAW_TAR}" ]]; then
  echo "appdata.tar 생성 실패 또는 빈 파일입니다." >&2
  exit 1
fi

echo "[4/6] tar 압축 해제"
tar -xf "${RAW_TAR}" -C "${TMP_DIR}"

echo "[5/6] URL 패턴 추출"
rg -a -o "https?://[A-Za-z0-9._~:/?#\\[\\]@!$&'()*+,;=%-]+" "${TMP_DIR}" \
  | sed 's#^[^:]*:##' \
  | sed 's/[",)\\]><]*$//' \
  | sed 's/[\[\]{}]$//' \
  | sort -u > "${ALL_URLS}"

# 리플레이 목적상 세븐일레븐 핵심 API 도메인 + /api/ 경로만 남긴다.
grep -E '^https://new\.7-elevenapp\.co\.kr/api/' "${ALL_URLS}" | sort -u > "${API_URLS}" || true
grep -E '7-eleven|kork7|lotte|new\.7-elevenapp|static\.7-elevenapp|traffic\.7-elevenapp' "${ALL_URLS}" \
  | sort -u > "${SEVEN_URLS}" || true

echo "[6/6] curl 템플릿 생성"
{
  echo "#!/usr/bin/env bash"
  echo "set -euo pipefail"
  echo ""
  echo "# 세븐일레븐 캐시 기반 API 리플레이 템플릿"
  echo "# 주의: Authorization/Cookie/X-Device-* 등은 실측값으로 교체 필요"
  echo ""

  if [[ -s "${API_URLS}" ]]; then
    i=1
    while IFS= read -r url; do
      [[ -z "${url}" ]] && continue
      echo "# ---- API 후보 ${i} ----"
      echo "curl '${url}' \\"
      echo "  -H 'accept: application/json, text/plain, */*' \\"
      echo "  -H 'user-agent: Mozilla/5.0 (Linux; Android 15)' \\"
      echo "  -H 'authorization: Bearer <REPLACE_TOKEN>' \\"
      echo "  -H 'cookie: <REPLACE_COOKIE>' \\"
      echo "  --compressed"
      echo ""
      i=$((i + 1))
    done < "${API_URLS}"
  else
    echo "# API URL 후보를 찾지 못했습니다."
  fi
} > "${CURL_TMPL}"
chmod +x "${CURL_TMPL}"

{
  echo "패키지: ${PACKAGE}"
  echo "생성시각: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "전체 URL 수: $(wc -l < "${ALL_URLS}" | tr -d ' ')"
  echo "API URL 수: $(wc -l < "${API_URLS}" | tr -d ' ')"
  echo "세븐일레븐 관련 URL 수: $(wc -l < "${SEVEN_URLS}" | tr -d ' ')"
  echo ""
  echo "산출물:"
  echo "- ${RAW_TAR}"
  echo "- ${ALL_URLS}"
  echo "- ${API_URLS}"
  echo "- ${SEVEN_URLS}"
  echo "- ${CURL_TMPL}"
} > "${SUMMARY}"

if [[ "${KEEP_EXTRACTED}" != "true" ]]; then
  rm -rf "${TMP_DIR}"
fi

echo ""
echo "완료:"
cat "${SUMMARY}"
