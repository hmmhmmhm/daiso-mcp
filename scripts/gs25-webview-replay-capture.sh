#!/usr/bin/env bash
set -euo pipefail

# GS25 WebView 리플레이 이벤트 자동 캡처 러너
# - Frida 추출 스크립트를 attach
# - [GS25_REPLAY] 로그를 JSONL로 분리 저장

PACKAGE="com.gsr.gs25"
FRIDA_HOST="127.0.0.1:27042"
PID=""
OUT_DIR=""

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-webview-replay-capture.sh [옵션]

옵션:
  --package <앱패키지>      기본값: com.gsr.gs25
  --host <frida_host:port>  기본값: 127.0.0.1:27042
  --pid <프로세스PID>       지정하지 않으면 adb pidof로 조회
  --out <출력디렉토리>      지정하지 않으면 captures/gs25-replay-YYYYmmdd-HHMMSS
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
  OUT_DIR="captures/gs25-replay-$(date +%Y%m%d-%H%M%S)"
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
EVENTS_JSONL="${OUT_DIR}/gs25-replay-events.jsonl"

echo "출력 디렉토리: ${OUT_DIR}"
echo "대상 PID: ${PID}"
echo "Raw 로그: ${RAW_LOG}"
echo "이벤트 JSONL: ${EVENTS_JSONL}"
echo "종료: Ctrl+C"

frida -H "${FRIDA_HOST}" -p "${PID}" -l scripts/frida/gs25-webview-replay-extract.js 2>&1 \
  | tee "${RAW_LOG}" \
  | awk '/\[GS25_REPLAY\] /{ sub(/^.*\[GS25_REPLAY\] /, ""); print; fflush(); }' \
  | tee -a "${EVENTS_JSONL}"

# 일부 환경에서는 프롬프트/제어문자 때문에 실시간 파이프 매칭이 누락될 수 있어
# 종료 시 raw 로그를 한 번 더 파싱해 JSONL이 비어 있으면 보정한다.
if [[ ! -s "${EVENTS_JSONL}" && -s "${RAW_LOG}" ]]; then
  awk '/\[GS25_REPLAY\] /{ sub(/^.*\[GS25_REPLAY\] /, ""); print; }' "${RAW_LOG}" \
    > "${EVENTS_JSONL}" || true
fi
