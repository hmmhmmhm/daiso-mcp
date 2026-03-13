#!/usr/bin/env bash
set -euo pipefail

# GS25 재고찾기 플로우를 좌표 기반으로 재현하는 ADB 스크립트
# 좌표는 기기/해상도마다 달라질 수 있어 환경변수로 덮어쓸 수 있습니다.

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"

TAP_STOCK_MENU="${TAP_STOCK_MENU:-420 2170}"
TAP_RECENT_SEARCH="${TAP_RECENT_SEARCH:-190 620}"
TAP_FIRST_PRODUCT="${TAP_FIRST_PRODUCT:-280 980}"
TAP_MAP_LIST_BUTTON="${TAP_MAP_LIST_BUTTON:-130 1960}"

STEP_SLEEP="${STEP_SLEEP:-2}"

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

tap() {
  local xy="$1"
  local x y
  x="$(awk '{print $1}' <<<"${xy}")"
  y="$(awk '{print $2}' <<<"${xy}")"
  adb_cmd shell input tap "${x}" "${y}"
}

echo "[1/6] 앱 실행"
adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep "${STEP_SLEEP}"

echo "[2/6] 재고찾기 메뉴 탭 (${TAP_STOCK_MENU})"
tap "${TAP_STOCK_MENU}"
sleep "${STEP_SLEEP}"

echo "[3/6] 최근 검색어 탭 (${TAP_RECENT_SEARCH})"
tap "${TAP_RECENT_SEARCH}"
sleep "${STEP_SLEEP}"

echo "[4/6] 첫 상품 탭 (${TAP_FIRST_PRODUCT})"
tap "${TAP_FIRST_PRODUCT}"
sleep "${STEP_SLEEP}"

echo "[5/6] 목록보기 버튼 탭 (${TAP_MAP_LIST_BUTTON})"
tap "${TAP_MAP_LIST_BUTTON}"
sleep "${STEP_SLEEP}"

echo "[6/6] 완료"
echo "필요 시 좌표를 다음 환경변수로 조정하세요:"
echo "  TAP_STOCK_MENU, TAP_RECENT_SEARCH, TAP_FIRST_PRODUCT, TAP_MAP_LIST_BUTTON"
