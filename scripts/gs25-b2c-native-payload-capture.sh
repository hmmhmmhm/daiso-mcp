#!/usr/bin/env bash
set -euo pipefail

# GS25 b2c 네이티브 payload 캡처 러너
# - Frida native payload hook attach
# - [GS25_B2C_NATIVE_PAYLOAD] 이벤트를 JSONL로 저장

PACKAGE="com.gsr.gs25"
FRIDA_HOST="127.0.0.1:27042"
PID=""
OUT_DIR=""
SPAWN=0

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-b2c-native-payload-capture.sh [옵션]

옵션:
  --package <앱패키지>      기본값: com.gsr.gs25
  --host <frida_host:port>  기본값: 127.0.0.1:27042
  --pid <프로세스PID>       지정하지 않으면 adb pidof로 조회
  --spawn                   PID attach 대신 spawn(-f) 모드 사용
  --out <출력디렉토리>      지정하지 않으면 captures/gs25-b2c-native-YYYYmmdd-HHMMSS
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
    --spawn)
      SPAWN=1
      shift 1
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
  OUT_DIR="captures/gs25-b2c-native-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_DIR}"

RAW_LOG="${OUT_DIR}/frida-b2c-native-raw.log"
EVENTS_JSONL="${OUT_DIR}/gs25-b2c-native-events.jsonl"

echo "출력 디렉토리: ${OUT_DIR}"
echo "Raw 로그: ${RAW_LOG}"
echo "이벤트 JSONL: ${EVENTS_JSONL}"
echo "종료: Ctrl+C"

FRIDA_CMD=(frida -H "${FRIDA_HOST}" -l scripts/frida/gs25-b2c-native-payload-hook.ts)

if [[ "${SPAWN}" -eq 1 ]]; then
  FRIDA_CMD+=(-f "${PACKAGE}")
  echo "모드: spawn (${PACKAGE})"
else
  if [[ -z "${PID}" ]]; then
    PID="$(adb shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  fi
  if [[ -z "${PID}" ]]; then
    echo "PID를 찾지 못했습니다. 앱 실행 후 다시 시도하거나 --spawn/--pid로 지정하세요." >&2
    exit 1
  fi
  FRIDA_CMD+=(-p "${PID}")
  echo "모드: attach (PID=${PID})"
fi

"${FRIDA_CMD[@]}" 2>&1 \
  | tee "${RAW_LOG}" \
  | awk '/\[GS25_B2C_NATIVE_PAYLOAD\] /{ sub(/^.*\[GS25_B2C_NATIVE_PAYLOAD\] /, ""); print; fflush(); }' \
  | tee -a "${EVENTS_JSONL}"

if [[ ! -s "${EVENTS_JSONL}" && -s "${RAW_LOG}" ]]; then
  awk '/\[GS25_B2C_NATIVE_PAYLOAD\] /{ sub(/^.*\[GS25_B2C_NATIVE_PAYLOAD\] /, ""); print; }' "${RAW_LOG}" \
    > "${EVENTS_JSONL}" || true
fi
