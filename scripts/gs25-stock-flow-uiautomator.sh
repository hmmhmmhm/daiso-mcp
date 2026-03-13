#!/usr/bin/env bash
set -euo pipefail

# GS25 재고찾기/검색 플로우를 UIAutomator dump 기반으로 재현합니다.
# 텍스트 매칭 실패 시 fallback 좌표를 사용합니다.

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
STEP_SLEEP="${STEP_SLEEP:-2}"

POPUP_CLOSE_TEXTS="${POPUP_CLOSE_TEXTS:-닫기|취소|오늘 하루 보지 않기}"
ADDRESS_MODAL_TEXTS="${ADDRESS_MODAL_TEXTS:-현재 주소를 먼저 설정해 주세요|주소에 따라 배달매장이 변경}"
SEARCH_TAB_TEXTS="${SEARCH_TAB_TEXTS:-검색}"
STOCK_MENU_TEXTS="${STOCK_MENU_TEXTS:-재고찾기|재고 찾기|재고}"
RECENT_SEARCH_TEXTS="${RECENT_SEARCH_TEXTS:-오감자|최근 검색어}"
FIRST_PRODUCT_TEXTS="${FIRST_PRODUCT_TEXTS:-오감자50G|오감자}"
MAP_LIST_TEXTS="${MAP_LIST_TEXTS:-목록보기|목록 보기}"

FALLBACK_SEARCH_TAB="${FALLBACK_SEARCH_TAB:-252 2088}"
FALLBACK_ADDRESS_CANCEL="${FALLBACK_ADDRESS_CANCEL:-271 1258}"
FALLBACK_STOCK_MENU="${FALLBACK_STOCK_MENU:-420 2170}"
FALLBACK_RECENT_SEARCH="${FALLBACK_RECENT_SEARCH:-190 620}"
FALLBACK_FIRST_PRODUCT="${FALLBACK_FIRST_PRODUCT:-280 980}"
FALLBACK_MAP_LIST="${FALLBACK_MAP_LIST:-130 1960}"

XML_REMOTE_PATH="/sdcard/window_dump.xml"
XML_LOCAL_PATH="/tmp/gs25_window_dump.xml"
FOCUS_RETRY="${FOCUS_RETRY:-8}"
FOCUS_WAIT_SEC="${FOCUS_WAIT_SEC:-1}"
DUMP_RETRY="${DUMP_RETRY:-6}"
DUMP_WAIT_SEC="${DUMP_WAIT_SEC:-1}"
PREEMPTIVE_MODAL_CLEAR="${PREEMPTIVE_MODAL_CLEAR:-1}"

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

dump_ui() {
  local tries=0
  while [[ "${tries}" -lt "${DUMP_RETRY}" ]]; do
    adb_cmd shell uiautomator dump "${XML_REMOTE_PATH}" >/dev/null 2>&1 || true
    adb_cmd exec-out cat "${XML_REMOTE_PATH}" > "${XML_LOCAL_PATH}" 2>/dev/null || true
    if [[ -s "${XML_LOCAL_PATH}" ]] && rg -q "<node " "${XML_LOCAL_PATH}"; then
      return 0
    fi
    tries=$((tries + 1))
    sleep "${DUMP_WAIT_SEC}"
  done
  return 1
}

ensure_app_foreground() {
  local tries=0
  while [[ "${tries}" -lt "${FOCUS_RETRY}" ]]; do
    local focus
    focus="$(adb_cmd shell dumpsys window | rg 'mCurrentFocus=' | tail -n 1 || true)"
    if [[ "${focus}" == *"${PACKAGE}"* ]]; then
      return 0
    fi
    tries=$((tries + 1))
    sleep "${FOCUS_WAIT_SEC}"
  done
  return 1
}

ensure_app_foreground_or_relaunch() {
  if ensure_app_foreground; then
    return 0
  fi
  adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  sleep 2
  ensure_app_foreground
}

find_center_by_patterns() {
  local patterns="$1"
  local escaped=""
  escaped="$(sed 's/[.[\*^$()+?{}|]/\\&/g' <<<"${patterns}" | sed 's/\\|/|/g')"
  perl -0777 -ne '
    use utf8;
    my $pat = $ARGV[0];
    while (/<node\b[^>]*>/g) {
      my $node = $&;
      my $text = "";
      $text = $1 if $node =~ /text="([^"]*)"/;
      my $desc = "";
      $desc = $1 if $node =~ /content-desc="([^"]*)"/;
      next unless ($text =~ /$pat/ || $desc =~ /$pat/);
      if ($node =~ /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) {
        my ($x1,$y1,$x2,$y2) = ($1,$2,$3,$4);
        my $cx = int(($x1 + $x2) / 2);
        my $cy = int(($y1 + $y2) / 2);
        print "$cx $cy\n";
        exit 0;
      }
    }
    exit 1;
  ' "${escaped}" "${XML_LOCAL_PATH}" 2>/dev/null || return 1
}

tap_by_text_or_fallback() {
  local step="$1"
  local patterns="$2"
  local fallback="$3"

  if dump_ui && xy="$(find_center_by_patterns "${patterns}")"; then
    echo "${step} 텍스트 매칭 탭: ${xy} (${patterns})"
    tap_xy "${xy}"
  else
    echo "${step} 텍스트 매칭 실패 -> fallback 탭: ${fallback} (${patterns})"
    tap_xy "${fallback}"
  fi
}

tap_if_found() {
  local step="$1"
  local patterns="$2"
  if dump_ui && xy="$(find_center_by_patterns "${patterns}")"; then
    echo "${step} 선택적 탭: ${xy} (${patterns})"
    tap_xy "${xy}"
    return 0
  fi
  echo "${step} 선택적 탭 없음 (${patterns})"
  return 1
}

clear_blocking_modals() {
  local tag="$1"
  local tries=0
  while [[ "${tries}" -lt 3 ]]; do
    if tap_if_found "${tag}" "${POPUP_CLOSE_TEXTS}"; then
      sleep 1
      tries=$((tries + 1))
      continue
    fi
    break
  done
}

dismiss_address_modal() {
  local tag="$1"
  local tries=0
  while [[ "${tries}" -lt 5 ]]; do
    if ! dump_ui; then
      echo "${tag} 주소모달 검사 실패: dump 비어있음"
      tries=$((tries + 1))
      sleep 1
      continue
    fi
    if ! find_center_by_patterns "${ADDRESS_MODAL_TEXTS}" >/dev/null 2>&1; then
      break
    fi
    echo "${tag} 주소모달 감지"
    if xy="$(find_center_by_patterns "취소|닫기")"; then
      echo "${tag} 주소모달 버튼 탭: ${xy}"
      tap_xy "${xy}"
    else
      echo "${tag} 주소모달 fallback 취소 탭: ${FALLBACK_ADDRESS_CANCEL}"
      tap_xy "${FALLBACK_ADDRESS_CANCEL}"
    fi
    adb_cmd shell input keyevent 4 >/dev/null 2>&1 || true
    sleep 1
    tries=$((tries + 1))
  done
}

preemptive_modal_clear() {
  if [[ "${PREEMPTIVE_MODAL_CLEAR}" != "1" ]]; then
    return 0
  fi
  echo "[pre] fallback 취소 탭: ${FALLBACK_ADDRESS_CANCEL}"
  tap_xy "${FALLBACK_ADDRESS_CANCEL}"
  adb_cmd shell input keyevent 4 >/dev/null 2>&1 || true
  sleep 1
}

echo "[1/7] 앱 실행"
adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep "${STEP_SLEEP}"
if ensure_app_foreground_or_relaunch; then
  echo "[1/7] 전면 확인: ${PACKAGE}"
else
  echo "[1/7] 전면 확인 실패, 진행 계속"
fi
preemptive_modal_clear
dismiss_address_modal "[1/7-post]"

echo "[2/7] 팝업 닫기(있을 때만)"
clear_blocking_modals "[2/7]"
dismiss_address_modal "[2/7-post]"
sleep "${STEP_SLEEP}"

echo "[3/7] 검색 탭 진입"
clear_blocking_modals "[3/7-pre]"
dismiss_address_modal "[3/7-pre2]"
tap_by_text_or_fallback "[3/7]" "${SEARCH_TAB_TEXTS}" "${FALLBACK_SEARCH_TAB}"
sleep "${STEP_SLEEP}"

echo "[4/7] 재고찾기 진입"
clear_blocking_modals "[4/7-pre]"
dismiss_address_modal "[4/7-pre2]"
tap_by_text_or_fallback "[4/7]" "${STOCK_MENU_TEXTS}" "${FALLBACK_STOCK_MENU}"
sleep "${STEP_SLEEP}"

echo "[5/7] 최근 검색어 선택"
clear_blocking_modals "[5/7-pre]"
dismiss_address_modal "[5/7-pre2]"
tap_by_text_or_fallback "[5/7]" "${RECENT_SEARCH_TEXTS}" "${FALLBACK_RECENT_SEARCH}"
sleep "${STEP_SLEEP}"

echo "[6/7] 첫 상품 선택"
clear_blocking_modals "[6/7-pre]"
dismiss_address_modal "[6/7-pre2]"
tap_by_text_or_fallback "[6/7]" "${FIRST_PRODUCT_TEXTS}" "${FALLBACK_FIRST_PRODUCT}"
sleep "${STEP_SLEEP}"

echo "[7/7] 목록보기 선택"
clear_blocking_modals "[7/7-pre]"
dismiss_address_modal "[7/7-pre2]"
tap_by_text_or_fallback "[7/7]" "${MAP_LIST_TEXTS}" "${FALLBACK_MAP_LIST}"
sleep "${STEP_SLEEP}"

echo "[완료]"
echo "필요 시 환경변수 조정:"
echo "  POPUP_CLOSE_TEXTS, SEARCH_TAB_TEXTS, STOCK_MENU_TEXTS"
echo "  RECENT_SEARCH_TEXTS, FIRST_PRODUCT_TEXTS, MAP_LIST_TEXTS"
echo "  FALLBACK_SEARCH_TAB, FALLBACK_STOCK_MENU, FALLBACK_RECENT_SEARCH"
echo "  FALLBACK_FIRST_PRODUCT, FALLBACK_MAP_LIST"
echo "  FALLBACK_ADDRESS_CANCEL, ADDRESS_MODAL_TEXTS"
echo "  FOCUS_RETRY, FOCUS_WAIT_SEC, DUMP_RETRY, DUMP_WAIT_SEC"
echo "  PREEMPTIVE_MODAL_CLEAR"
