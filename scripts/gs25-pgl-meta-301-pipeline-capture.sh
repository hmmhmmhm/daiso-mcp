#!/usr/bin/env bash
set -euo pipefail

HOST="${FRIDA_HOST:-127.0.0.1:27042}"
OUT_DIR=""
SPAWN=0
PID=""

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
    --pid)
      PID="$2"
      shift 2
      ;;
    *)
      echo "사용법: $0 [--host HOST:PORT] [--out DIR] [--spawn] [--pid PID]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUT_DIR" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  OUT_DIR="captures/gs25-pgl-meta-301-pipeline-${TS}"
fi

mkdir -p "$OUT_DIR"
RAW_LOG="${OUT_DIR}/frida-pgl-meta-301-pipeline-raw.log"
JAVA_JSONL="${OUT_DIR}/gs25-pgl-meta-events.jsonl"
PIPE_JSONL="${OUT_DIR}/gs25-pgl-meta-301-pipeline-events.jsonl"

echo "출력 디렉토리: $OUT_DIR"
echo "Raw 로그: $RAW_LOG"
echo "Java 이벤트: $JAVA_JSONL"
echo "Pipeline 이벤트: $PIPE_JSONL"

FRIDA_CMD=(
  frida -H "$HOST"
  -l scripts/frida/gs25-pgl-meta-hook.ts
  -l scripts/frida/gs25-pgl-meta-301-pipeline-probe.ts
)
if [[ "$SPAWN" -eq 1 ]]; then
  FRIDA_CMD+=(-f com.gsr.gs25)
elif [[ -n "$PID" ]]; then
  FRIDA_CMD+=(-p "$PID")
else
  FRIDA_CMD+=(-n com.gsr.gs25)
fi

"${FRIDA_CMD[@]}" | tee "$RAW_LOG"
