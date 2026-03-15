#!/usr/bin/env bash
set -euo pipefail

# 세븐일레븐 WebView 리플레이 이벤트 자동 캡처 러너
# - 앱 실행 후 PID attach (spawn 미사용)
# - [SE_REPLAY] 로그를 JSONL로 분리 저장

PACKAGE="kr.co.kork7app"
FRIDA_HOST="127.0.0.1:27042"
PID=""
OUT_DIR=""

usage() {
  cat <<'EOF'
사용법:
  scripts/seveneleven-webview-replay-capture.sh [옵션]

옵션:
  --package <앱패키지>      기본값: kr.co.kork7app
  --host <frida_host:port>  기본값: 127.0.0.1:27042
  --pid <프로세스PID>       지정하지 않으면 adb pidof로 조회
  --out <출력디렉토리>      지정하지 않으면 captures/seveneleven-replay-YYYYmmdd-HHMMSS
  -h, --help                도움말 출력
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --host)
      FRIDA_HOST="$2"
      shift 2
      ;;
    --pid)
      PID="$2"
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

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="captures/seveneleven-replay-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_DIR}"

if [[ -z "${PID}" ]]; then
  PID="$(adb shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
fi

if [[ -z "${PID}" ]]; then
  echo "PID를 찾지 못했습니다. 앱 실행 후 다시 시도하거나 --pid로 지정하세요." >&2
  exit 1
fi

RAW_LOG="${OUT_DIR}/frida-replay-raw.log"
EVENTS_JSONL="${OUT_DIR}/seveneleven-replay-events.jsonl"

echo "출력 디렉토리: ${OUT_DIR}"
echo "대상 PID: ${PID}"
echo "Raw 로그: ${RAW_LOG}"
echo "이벤트 JSONL: ${EVENTS_JSONL}"
echo "종료: Ctrl+C"

frida -H "${FRIDA_HOST}" -p "${PID}" -l scripts/frida/seveneleven-webview-minimal-replay.ts 2>&1 \
  | tee "${RAW_LOG}" \
  | awk '/\[SE_REPLAY\] /{ sub(/^.*\[SE_REPLAY\] /, ""); print; fflush(); }' \
  | tee -a "${EVENTS_JSONL}"

# 일부 환경에서는 제어문자/프롬프트로 실시간 파싱이 누락될 수 있어 종료 시 보정한다.
if [[ ! -s "${EVENTS_JSONL}" && -s "${RAW_LOG}" ]]; then
  awk '/\[SE_REPLAY\] /{ sub(/^.*\[SE_REPLAY\] /, ""); print; }' "${RAW_LOG}" \
    > "${EVENTS_JSONL}" || true
fi
