#!/usr/bin/env bash
set -euo pipefail

# GS25 New 라운드 실행기 (2단계 분리)
# 1) pgl spawn + UI 재현
# 2) b2c attach/spawn + UI 재현

FRIDA_HOST="${FRIDA_HOST:-127.0.0.1:27042}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
UI_SCRIPT="${UI_SCRIPT:-scripts/gs25-stock-flow-uiautomator.sh}"
WINDOW_SEC="${WINDOW_SEC:-60}"
WITH_MITM="${WITH_MITM:-0}"
MITM_IGNORE_HOSTS="${MITM_IGNORE_HOSTS:-(^(.+\\.)?google\\.com(:[0-9]+)?$)|(^(.+\\.)?gstatic\\.com(:[0-9]+)?$)|(^play\\.googleapis\\.com(:[0-9]+)?$)}"
SSL_BYPASS_SCRIPT=""
ROUND_LOG=""
PGL_DIR=""
B2C_DIR=""
MITM_DIR=""
SCENARIO="gs25-new round"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-new-round-runner.sh --round-log <file> --pgl-dir <dir> --b2c-dir <dir> --mitm-dir <dir> [옵션]

옵션:
  --host <host:port>       frida host (기본: 127.0.0.1:27042)
  --package <패키지>        앱 패키지 (기본: com.gsr.gs25)
  --ui-script <경로>        UI 재현 스크립트
  --window <초>             라운드 전체 윈도우 (기본: 60)
  --with-mitm <0|1>         mitm 동시 수집 여부 (기본: 0)
  --mitm-ignore-hosts <re>  mitm 무시 호스트 정규식
  --ssl-bypass-script <CSV>  Frida SSL bypass 스크립트 목록(선택)
  --scenario <문자열>       mitm 시나리오 라벨
  --device <serial>         adb 시리얼
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --round-log)
      ROUND_LOG="$2"
      shift 2
      ;;
    --pgl-dir)
      PGL_DIR="$2"
      shift 2
      ;;
    --b2c-dir)
      B2C_DIR="$2"
      shift 2
      ;;
    --mitm-dir)
      MITM_DIR="$2"
      shift 2
      ;;
    --host)
      FRIDA_HOST="$2"
      shift 2
      ;;
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --ui-script)
      UI_SCRIPT="$2"
      shift 2
      ;;
    --window)
      WINDOW_SEC="$2"
      shift 2
      ;;
    --with-mitm)
      WITH_MITM="$2"
      shift 2
      ;;
    --mitm-ignore-hosts)
      MITM_IGNORE_HOSTS="$2"
      shift 2
      ;;
    --ssl-bypass-script)
      SSL_BYPASS_SCRIPT="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --device)
      DEVICE_SERIAL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${ROUND_LOG}" || -z "${PGL_DIR}" || -z "${B2C_DIR}" || -z "${MITM_DIR}" ]]; then
  usage
  exit 1
fi

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

run_with_timeout() {
  local sec="$1"
  shift 1
  if command -v timeout >/dev/null 2>&1; then
    timeout "${sec}" "$@" || true
    return 0
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${sec}" "$@" || true
    return 0
  fi
  "$@" &
  local cmd_pid=$!
  (
    sleep "${sec}"
    kill -TERM "${cmd_pid}" 2>/dev/null || true
    sleep 2
    kill -KILL "${cmd_pid}" 2>/dev/null || true
  ) &
  local watchdog_pid=$!
  wait "${cmd_pid}" 2>/dev/null || true
  kill "${watchdog_pid}" 2>/dev/null || true
  wait "${watchdog_pid}" 2>/dev/null || true
}

cleanup_pid() {
  local pid="$1"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  fi
}

PGL_PHASE_SEC=$(( (WINDOW_SEC * 2) / 3 ))
if (( PGL_PHASE_SEC < 40 )); then
  PGL_PHASE_SEC=40
fi
if (( PGL_PHASE_SEC >= WINDOW_SEC )); then
  PGL_PHASE_SEC=$(( WINDOW_SEC - 20 ))
fi
B2C_PHASE_SEC=$(( WINDOW_SEC - PGL_PHASE_SEC ))
if (( B2C_PHASE_SEC < 20 )); then
  B2C_PHASE_SEC=20
fi

MITM_PID=""
PGL_PID=""
B2C_PID=""
SSL_BYPASS_PID=""

cleanup_all() {
  cleanup_pid "${SSL_BYPASS_PID}"
  cleanup_pid "${B2C_PID}"
  cleanup_pid "${PGL_PID}"
  cleanup_pid "${MITM_PID}"
}
trap cleanup_all EXIT

start_ssl_bypass() {
  if [[ -z "${SSL_BYPASS_SCRIPT}" ]]; then
    return 0
  fi
  local app_pid=""
  local tries=0
  while [[ -z "${app_pid}" && "${tries}" -lt 20 ]]; do
    app_pid="$(adb_cmd shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
    if [[ -z "${app_pid}" ]]; then
      sleep 1
    fi
    tries=$((tries + 1))
  done
  if [[ -z "${app_pid}" ]]; then
    echo "[round-runner] ssl-bypass attach skipped: app pid not found" >> "${ROUND_LOG}"
    return 0
  fi
  local -a cmd
  cmd=(frida -H "${FRIDA_HOST}" -p "${app_pid}")
  IFS=',' read -r -a scripts <<< "${SSL_BYPASS_SCRIPT}"
  for script in "${scripts[@]}"; do
    script="$(echo "${script}" | xargs)"
    if [[ -n "${script}" ]]; then
      cmd+=(-l "${script}")
    fi
  done
  echo "[round-runner] ssl-bypass attach pid=${app_pid} scripts=${SSL_BYPASS_SCRIPT}" >> "${ROUND_LOG}"
  "${cmd[@]}" >> "${ROUND_LOG}" 2>&1 &
  SSL_BYPASS_PID=$!
}

if [[ "${WITH_MITM}" == "1" ]]; then
  mitmdump \
    -s scripts/mitmproxy/gs25_capture_export.py \
    --set "gs25_capture_dir=${MITM_DIR}" \
    --set "gs25_capture_scenario=${SCENARIO}" \
    --set "gs25_capture_hosts=*" \
    --ignore-hosts "${MITM_IGNORE_HOSTS}" \
    -w "${MITM_DIR}/raw.mitm" >> "${ROUND_LOG}" 2>&1 &
  MITM_PID=$!
fi

# Phase 1: pgl spawn
bash scripts/gs25-pgl-meta-301-pipeline-capture.sh \
  --spawn \
  --host "${FRIDA_HOST}" \
  --out "${PGL_DIR}" >> "${ROUND_LOG}" 2>&1 &
PGL_PID=$!

sleep 5
start_ssl_bypass
if [[ -x "${UI_SCRIPT}" ]]; then
  run_with_timeout 90 "${UI_SCRIPT}" >> "${ROUND_LOG}" 2>&1
else
  bash "${UI_SCRIPT}" >> "${ROUND_LOG}" 2>&1 || true
fi
sleep "${PGL_PHASE_SEC}"
cleanup_pid "${PGL_PID}"
PGL_PID=""

# Phase 2: b2c attach/spawn
APP_PID="$(adb_cmd shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
if [[ -n "${APP_PID}" ]]; then
  bash scripts/gs25-b2c-native-payload-capture.sh \
    --host "${FRIDA_HOST}" \
    --package "${PACKAGE}" \
    --pid "${APP_PID}" \
    --out "${B2C_DIR}" >> "${ROUND_LOG}" 2>&1 &
else
  bash scripts/gs25-b2c-native-payload-capture.sh \
    --spawn \
    --host "${FRIDA_HOST}" \
    --package "${PACKAGE}" \
    --out "${B2C_DIR}" >> "${ROUND_LOG}" 2>&1 &
fi
B2C_PID=$!

sleep 3
if [[ -x "${UI_SCRIPT}" ]]; then
  run_with_timeout 90 "${UI_SCRIPT}" >> "${ROUND_LOG}" 2>&1
else
  bash "${UI_SCRIPT}" >> "${ROUND_LOG}" 2>&1 || true
fi
sleep "${B2C_PHASE_SEC}"
cleanup_pid "${B2C_PID}"
B2C_PID=""

cleanup_pid "${MITM_PID}"
MITM_PID=""
