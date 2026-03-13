#!/usr/bin/env bash
set -euo pipefail

# GS25 하이브리드 플로우
# 1) 앱 실행 후 짧게 대기(idle)
# 2) 재고찾기 UI 플로우 실행

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
IDLE_SEC="${IDLE_SEC:-20}"

echo "[hybrid] idle phase (${IDLE_SEC}s)"
DEVICE_SERIAL="${DEVICE_SERIAL}" IDLE_SEC="${IDLE_SEC}" \
  scripts/gs25-idle-flow.sh || true

echo "[hybrid] stock-flow phase"
DEVICE_SERIAL="${DEVICE_SERIAL}" \
  scripts/gs25-stock-flow-uiautomator.sh || true

echo "[hybrid] done"
