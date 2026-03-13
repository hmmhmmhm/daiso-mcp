#!/usr/bin/env bash
set -euo pipefail

# 목표 pangle path가 나올 때까지 반복 캡처합니다.
#
# 예:
#   scripts/gs25-pangle-path-hunt.sh \
#     --target "/api/ad/union/sdk/get_ads/" \
#     --attempts 5 \
#     --duration 90

TARGET_PATH="${TARGET_PATH:-/api/ad/union/sdk/get_ads/}"
ATTEMPTS="${ATTEMPTS:-5}"
DURATION_SEC="${DURATION_SEC:-90}"
FLOW_SCRIPT="${FLOW_SCRIPT:-scripts/gs25-stock-flow-uiautomator.sh}"
OUT_PREFIX="${OUT_PREFIX:-captures/gs25-pangle-hunt}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-pangle-path-hunt.sh [옵션]

옵션:
  --target <path>      탐지할 path (기본: /api/ad/union/sdk/get_ads/)
  --attempts <정수>    최대 시도 횟수 (기본: 5)
  --duration <초>      각 시도 frida 실행 시간 (기본: 90)
  --flow-script <경로> 캡처 중 실행할 UI 스크립트
  --out-prefix <경로>  로그 파일 prefix
  --device <serial>    adb 디바이스 시리얼
  -h, --help           도움말
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_PATH="$2"
      shift 2
      ;;
    --attempts)
      ATTEMPTS="$2"
      shift 2
      ;;
    --duration)
      DURATION_SEC="$2"
      shift 2
      ;;
    --flow-script)
      FLOW_SCRIPT="$2"
      shift 2
      ;;
    --out-prefix)
      OUT_PREFIX="$2"
      shift 2
      ;;
    --device)
      DEVICE_SERIAL="$2"
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

mkdir -p "$(dirname "${OUT_PREFIX}")"

for ((i = 1; i <= ATTEMPTS; i++)); do
  LOG="${OUT_PREFIX}-$(date +%Y%m%d-%H%M%S)-r${i}.log"
  echo "[hunt ${i}/${ATTEMPTS}] capture: ${LOG}"

  (
    DEVICE_SERIAL="${DEVICE_SERIAL}" DURATION_SEC="${DURATION_SEC}" \
      scripts/gs25-pangle-conscrypt-capture.sh "${LOG}" &
    CAP_PID=$!
    sleep 8
    if [[ -x "${FLOW_SCRIPT}" ]]; then
      DEVICE_SERIAL="${DEVICE_SERIAL}" "${FLOW_SCRIPT}" || true
    else
      bash "${FLOW_SCRIPT}" || true
    fi
    wait "${CAP_PID}" || true
  )

  TARGET_PATH_ESCAPED="$(printf '%s' "${TARGET_PATH}" | sed -e 's/[.[\*^$()+?{}|]/\\&/g')"
  if rg -n "\"t\":\"pangle_req\".*\"path\":\"${TARGET_PATH_ESCAPED}" "${LOG}" >/dev/null 2>&1; then
    echo "[found] target path observed: ${TARGET_PATH}"
    echo "[found] log: ${LOG}"
    exit 0
  fi
  echo "[miss] target path not observed: ${TARGET_PATH}"
done

echo "[done] target path not found after ${ATTEMPTS} attempts: ${TARGET_PATH}"
exit 2
