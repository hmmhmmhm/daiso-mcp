#!/usr/bin/env bash
set -euo pipefail

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
DURATION_SEC="${DURATION_SEC:-25}"
OUT_LOG="${1:-captures/gs25-pangle-conscrypt-latest.log}"

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

mkdir -p "$(dirname "${OUT_LOG}")"

adb_cmd shell am force-stop com.gsr.gs25 || true
frida -U -f com.gsr.gs25 \
  -l scripts/frida/android-ssl-bypass.ts \
  -l scripts/frida/gs25-pangle-conscrypt-replay-hook.ts \
  -q -t "${DURATION_SEC}" > "${OUT_LOG}" 2>&1 || true

echo "saved: ${OUT_LOG}"
