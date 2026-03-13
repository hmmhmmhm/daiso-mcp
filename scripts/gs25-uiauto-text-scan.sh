#!/usr/bin/env bash
set -euo pipefail

# 현재 화면의 UIAutomator dump에서 text/content-desc/bounds를 추출합니다.

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
XML_REMOTE_PATH="${XML_REMOTE_PATH:-/sdcard/window_dump.xml}"
OUT_PATH="${1:-}"
SCAN_RETRY="${SCAN_RETRY:-8}"
SCAN_WAIT_SEC="${SCAN_WAIT_SEC:-1}"

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

if [[ -z "${OUT_PATH}" ]]; then
  OUT_PATH="captures/gs25-uiauto-scan-$(date +%Y%m%d-%H%M%S).txt"
fi

mkdir -p "$(dirname "${OUT_PATH}")"

TMP_XML="/tmp/gs25_uiauto_scan.xml"
ok=0
for _ in $(seq 1 "${SCAN_RETRY}"); do
  adb_cmd shell uiautomator dump "${XML_REMOTE_PATH}" >/dev/null 2>&1 || true
  adb_cmd exec-out cat "${XML_REMOTE_PATH}" > "${TMP_XML}" 2>/dev/null || true
  if [[ -s "${TMP_XML}" ]] && rg -q "<node " "${TMP_XML}"; then
    ok=1
    break
  fi
  sleep "${SCAN_WAIT_SEC}"
done

if [[ "${ok}" -ne 1 ]]; then
  : > "${OUT_PATH}"
  echo "saved: ${OUT_PATH} (empty: dump retry exhausted)"
  exit 0
fi

perl -0777 -ne '
  use utf8;
  while (/<node\b[^>]*>/g) {
    my $node = $&;
    my ($text) = $node =~ /text="([^"]*)"/;
    my ($desc) = $node =~ /content-desc="([^"]*)"/;
    my ($bounds) = $node =~ /bounds="(\[[^"]+\])"/;
    my ($klass) = $node =~ /class="([^"]*)"/;
    $text //= "";
    $desc //= "";
    $bounds //= "";
    $klass //= "";
    next if $text eq "" && $desc eq "";
    print "$klass\ttext=$text\tdesc=$desc\tbounds=$bounds\n";
  }
' "${TMP_XML}" | sort -u > "${OUT_PATH}"

echo "saved: ${OUT_PATH}"
