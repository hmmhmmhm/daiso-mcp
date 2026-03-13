#!/usr/bin/env bash
set -euo pipefail

# GS25 앱을 실행한 뒤 일정 시간 대기하여
# 초기 광고/설정 요청이 자연 발생하도록 유도합니다.

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
IDLE_SEC="${IDLE_SEC:-45}"

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

echo "[idle] launch: ${PACKAGE}"
adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep 3

echo "[idle] keep screen on"
adb_cmd shell input keyevent 224 >/dev/null 2>&1 || true

echo "[idle] wait ${IDLE_SEC}s"
sleep "${IDLE_SEC}"

echo "[idle] done"
