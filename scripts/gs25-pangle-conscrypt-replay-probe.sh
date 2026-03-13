#!/usr/bin/env bash
set -euo pipefail

# GS25 pangle direct-write 교체 프로브 실행기
#
# 예:
#   scripts/gs25-pangle-conscrypt-replay-probe.sh \
#     --match-len 1690 \
#     --hex 00 \
#     --duration 12 \
#     --out captures/gs25-pangle-conscrypt-replay-probe.log

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
MATCH_LEN="${MATCH_LEN:-0}"
REPLAY_HEX="${REPLAY_HEX:-}"
DURATION_SEC="${DURATION_SEC:-12}"
OUT_LOG="${OUT_LOG:-captures/gs25-pangle-conscrypt-replay-probe.log}"
AFTER_PATH="${AFTER_PATH:-}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-pangle-conscrypt-replay-probe.sh [옵션]

옵션:
  --match-len <정수>   direct write 교체 대상 길이
  --hex <hex>          교체 payload(hex)
  --duration <초>      frida 실행 시간
  --out <파일>         로그 출력 파일
  --after-path <path>  해당 요청 path 관측 직후 첫 direct chunk에 교체 적용
  --device <serial>    adb 디바이스 시리얼
  -h, --help           도움말
EOF
}

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --match-len)
      MATCH_LEN="$2"
      shift 2
      ;;
    --hex)
      REPLAY_HEX="$2"
      shift 2
      ;;
    --duration)
      DURATION_SEC="$2"
      shift 2
      ;;
    --out)
      OUT_LOG="$2"
      shift 2
      ;;
    --after-path)
      AFTER_PATH="$2"
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

mkdir -p "$(dirname "${OUT_LOG}")"

CFG_JS='globalThis.__PANGLE_CFG={};'
if [[ "${MATCH_LEN}" != "0" ]]; then
  CFG_JS+="globalThis.__PANGLE_CFG.PANGLE_REPLAY_DIRECT_MATCH_LEN='${MATCH_LEN}';"
fi
if [[ -n "${REPLAY_HEX}" ]]; then
  CFG_JS+="globalThis.__PANGLE_CFG.PANGLE_REPLAY_DIRECT_HEX='${REPLAY_HEX}';"
fi
if [[ -n "${AFTER_PATH}" ]]; then
  CFG_JS+="globalThis.__PANGLE_CFG.PANGLE_REPLAY_AFTER_PATH='${AFTER_PATH}';"
fi

adb_cmd shell am force-stop com.gsr.gs25 || true
frida -U -f com.gsr.gs25 \
  -e "${CFG_JS}" \
  -l scripts/frida/android-ssl-bypass.js \
  -l scripts/frida/gs25-pangle-conscrypt-replay-hook.js \
  -q -t "${DURATION_SEC}" > "${OUT_LOG}" 2>&1 || true

echo "saved: ${OUT_LOG}"
