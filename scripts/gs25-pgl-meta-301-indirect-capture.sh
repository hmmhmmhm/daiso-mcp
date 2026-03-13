#!/usr/bin/env bash
set -euo pipefail

HOST="${FRIDA_HOST:-127.0.0.1:27042}"
OUT_DIR=""
SPAWN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --spawn)
      SPAWN=1
      shift
      ;;
    *)
      echo "사용법: $0 [--host HOST:PORT] [--out DIR] [--spawn]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUT_DIR" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  OUT_DIR="captures/gs25-pgl-meta-301-indirect-${TS}"
fi

mkdir -p "$OUT_DIR"
RAW_LOG="${OUT_DIR}/frida-pgl-meta-301-indirect-raw.log"
JSONL="${OUT_DIR}/gs25-pgl-meta-301-indirect-events.jsonl"

echo "출력 디렉토리: $OUT_DIR"
echo "Raw 로그: $RAW_LOG"
echo "이벤트 JSONL: $JSONL"

FRIDA_CMD=(frida -H "$HOST" -l scripts/frida/gs25-pgl-meta-301-indirect-probe.js)
if [[ "$SPAWN" -eq 1 ]]; then
  FRIDA_CMD+=(-f com.gsr.gs25)
else
  FRIDA_CMD+=(-n com.gsr.gs25)
fi

"${FRIDA_CMD[@]}" \
  | tee "$RAW_LOG" \
  | awk '/\[GS25_PGL_301_INDIRECT\]/ { idx=index($0,"{"); if (idx>0) print substr($0, idx); fflush(); }' \
  | tee -a "$JSONL"
