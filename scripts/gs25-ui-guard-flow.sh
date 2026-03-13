#!/usr/bin/env bash
set -euo pipefail

# GS25 UI 가드 플로우
# - 권한/업데이트/로그인/주소 관련 팝업을 텍스트 매칭으로 정리
# - 실패 시 좌표 fallback으로 최소 정리 동작을 수행

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
PASS_COUNT="${PASS_COUNT:-3}"
STEP_SLEEP="${STEP_SLEEP:-1}"

ALLOW_TEXTS="${ALLOW_TEXTS:-허용|앱 사용 중에만 허용|정확한 위치|확인}"
DENY_TEXTS="${DENY_TEXTS:-나중에|취소|닫기|다음에}"
UPDATE_SKIP_TEXTS="${UPDATE_SKIP_TEXTS:-나중에|다음에|건너뛰기}"
LOGIN_SKIP_TEXTS="${LOGIN_SKIP_TEXTS:-닫기|나중에|건너뛰기|취소}"
ADDRESS_TEXTS="${ADDRESS_TEXTS:-현재 주소를 먼저 설정해 주세요|주소에 따라 배달매장이 변경|위치 권한이 필요}"
ADDRESS_CANCEL_TEXTS="${ADDRESS_CANCEL_TEXTS:-취소|닫기|아니요}"

FALLBACK_CANCEL="${FALLBACK_CANCEL:-271 1258}"
FALLBACK_CLOSE="${FALLBACK_CLOSE:-778 1571}"

XML_REMOTE_PATH="/sdcard/window_dump.xml"
XML_LOCAL_PATH="/tmp/gs25_ui_guard_dump.xml"

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
  adb_cmd shell input tap "${x}" "${y}" >/dev/null 2>&1 || true
}

dump_ui() {
  adb_cmd shell uiautomator dump "${XML_REMOTE_PATH}" >/dev/null 2>&1 || true
  adb_cmd exec-out cat "${XML_REMOTE_PATH}" > "${XML_LOCAL_PATH}" 2>/dev/null || true
  [[ -s "${XML_LOCAL_PATH}" ]] && rg -q "<node " "${XML_LOCAL_PATH}"
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

tap_first_match() {
  local label="$1"
  local patterns="$2"
  if ! dump_ui; then
    return 1
  fi
  local xy
  if xy="$(find_center_by_patterns "${patterns}")"; then
    echo "[guard] ${label} 탭: ${xy} (${patterns})"
    tap_xy "${xy}"
    return 0
  fi
  return 1
}

ensure_foreground() {
  local focus
  focus="$(adb_cmd shell dumpsys window | rg 'mCurrentFocus=' | tail -n 1 || true)"
  if [[ "${focus}" != *"${PACKAGE}"* ]]; then
    adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    sleep 2
  fi
}

echo "[guard] start pass_count=${PASS_COUNT}"
ensure_foreground

for ((i=1; i<=PASS_COUNT; i+=1)); do
  echo "[guard] pass ${i}/${PASS_COUNT}"
  changed=0

  if tap_first_match "권한 허용" "${ALLOW_TEXTS}"; then
    changed=1
    sleep "${STEP_SLEEP}"
  fi
  if tap_first_match "업데이트/권한 거절" "${DENY_TEXTS}|${UPDATE_SKIP_TEXTS}"; then
    changed=1
    sleep "${STEP_SLEEP}"
  fi
  if tap_first_match "로그인/안내 닫기" "${LOGIN_SKIP_TEXTS}"; then
    changed=1
    sleep "${STEP_SLEEP}"
  fi
  if dump_ui && find_center_by_patterns "${ADDRESS_TEXTS}" >/dev/null 2>&1; then
    echo "[guard] 주소/위치 안내 감지"
    if tap_first_match "주소 안내 취소" "${ADDRESS_CANCEL_TEXTS}"; then
      changed=1
      sleep "${STEP_SLEEP}"
    else
      echo "[guard] 주소 안내 fallback 취소 탭"
      tap_xy "${FALLBACK_CANCEL}"
      changed=1
      sleep "${STEP_SLEEP}"
    fi
  fi

  if [[ "${changed}" -eq 0 ]]; then
    tap_xy "${FALLBACK_CLOSE}"
    tap_xy "${FALLBACK_CANCEL}"
    adb_cmd shell input keyevent 4 >/dev/null 2>&1 || true
    sleep "${STEP_SLEEP}"
  fi
done

echo "[guard] done"
