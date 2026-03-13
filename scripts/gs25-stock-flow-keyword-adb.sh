#!/usr/bin/env bash
set -euo pipefail

# GS25 앱에서 키워드 검색 기반으로 재고찾기 흐름을 강제 시도합니다.

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
SEARCH_KEYWORD="${SEARCH_KEYWORD:-8801117752804}"
STEP_SLEEP="${STEP_SLEEP:-2}"

TAP_BOTTOM_SEARCH="${TAP_BOTTOM_SEARCH:-252 2088}"
TAP_SEARCH_INPUT="${TAP_SEARCH_INPUT:-420 260}"
TAP_FIRST_RESULT="${TAP_FIRST_RESULT:-420 820}"
TAP_STOCK_BUTTON="${TAP_STOCK_BUTTON:-420 1980}"
TAP_LIST_BUTTON="${TAP_LIST_BUTTON:-130 1960}"
TAP_MODAL_CANCEL="${TAP_MODAL_CANCEL:-271 1258}"
TAP_MODAL_CONFIRM="${TAP_MODAL_CONFIRM:-568 1264}"
TAP_POPUP_CLOSE="${TAP_POPUP_CLOSE:-778 1571}"
MODAL_ACTION="${MODAL_ACTION:-cancel}" # cancel|confirm|back

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

tap_xy() {
  local xy="$1"
  local x y
  x="$(awk '{print $1}' <<<"${xy}")"
  y="$(awk '{print $2}' <<<"${xy}")"
  adb_cmd shell input tap "${x}" "${y}"
}

echo "[1/9] 앱 실행"
adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep "${STEP_SLEEP}"

echo "[2/9] 초기 팝업/모달 닫기"
tap_xy "${TAP_POPUP_CLOSE}" || true
if [[ "${MODAL_ACTION}" == "confirm" ]]; then
  tap_xy "${TAP_MODAL_CONFIRM}" || true
elif [[ "${MODAL_ACTION}" == "back" ]]; then
  adb_cmd shell input keyevent 4 >/dev/null 2>&1 || true
else
  tap_xy "${TAP_MODAL_CANCEL}" || true
fi
sleep "${STEP_SLEEP}"

echo "[3/9] 하단 검색 탭"
tap_xy "${TAP_BOTTOM_SEARCH}"
sleep "${STEP_SLEEP}"

echo "[4/9] 검색 입력창 포커스"
tap_xy "${TAP_SEARCH_INPUT}"
sleep 1

echo "[5/9] 키워드 입력: ${SEARCH_KEYWORD}"
adb_cmd shell input keyevent 123 >/dev/null 2>&1 || true
adb_cmd shell input keyevent 67 >/dev/null 2>&1 || true
adb_cmd shell input text "${SEARCH_KEYWORD}" >/dev/null 2>&1 || true
adb_cmd shell input keyevent 66 >/dev/null 2>&1 || true
sleep 3

echo "[6/9] 첫 검색 결과 선택"
tap_xy "${TAP_FIRST_RESULT}"
sleep "${STEP_SLEEP}"

echo "[7/9] 재고찾기 버튼 시도"
tap_xy "${TAP_STOCK_BUTTON}"
sleep "${STEP_SLEEP}"

echo "[8/9] 주소 모달 취소 + 목록 버튼 시도"
if [[ "${MODAL_ACTION}" == "confirm" ]]; then
  tap_xy "${TAP_MODAL_CONFIRM}" || true
elif [[ "${MODAL_ACTION}" == "back" ]]; then
  adb_cmd shell input keyevent 4 >/dev/null 2>&1 || true
else
  tap_xy "${TAP_MODAL_CANCEL}" || true
fi
tap_xy "${TAP_LIST_BUTTON}" || true
sleep "${STEP_SLEEP}"

echo "[9/9] 완료"
echo "좌표 조정 변수:"
echo "  TAP_BOTTOM_SEARCH TAP_SEARCH_INPUT TAP_FIRST_RESULT"
echo "  TAP_STOCK_BUTTON TAP_LIST_BUTTON TAP_MODAL_CANCEL TAP_MODAL_CONFIRM TAP_POPUP_CLOSE"
echo "  MODAL_ACTION(cancel|confirm|back)"
