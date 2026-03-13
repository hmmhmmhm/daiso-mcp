#!/usr/bin/env bash
set -euo pipefail

# GS25 New 실행 전 환경 점검
# - 무인 실행 전에 ADB/Frida/패키지/루트 모듈/프록시 상태를 빠르게 검증

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
FRIDA_PORT="${FRIDA_PORT:-27042}"
EXPECT_MITM="${EXPECT_MITM:-0}"
EXPECT_ROOT_MODULES="${EXPECT_ROOT_MODULES:-1}"
JSON_MODE="${JSON_MODE:-0}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-new-preflight-check.sh [옵션]

옵션:
  --device <serial>         adb 디바이스 시리얼
  --package <앱패키지>       기본: com.gsr.gs25
  --frida-port <포트>        기본: 27042
  --expect-mitm <0|1>        프록시 사용 예정 여부 (기본: 0)
  --expect-root-modules <0|1> 루트 모듈 확인 여부 (기본: 1)
  --json                     JSON 출력
  -h, --help                 도움말
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE_SERIAL="$2"
      shift 2
      ;;
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --frida-port)
      FRIDA_PORT="$2"
      shift 2
      ;;
    --expect-mitm)
      EXPECT_MITM="$2"
      shift 2
      ;;
    --expect-root-modules)
      EXPECT_ROOT_MODULES="$2"
      shift 2
      ;;
    --json)
      JSON_MODE="1"
      shift 1
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

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

line() {
  if [[ "${JSON_MODE}" == "1" ]]; then
    return 0
  fi
  echo "$*"
}

json_escape() {
  local text="$1"
  text="${text//\\/\\\\}"
  text="${text//\"/\\\"}"
  text="${text//$'\n'/\\n}"
  printf '%s' "${text}"
}

check_adb_state() {
  local state
  state="$(adb_cmd get-state 2>/dev/null || true)"
  if [[ "${state}" == "device" ]]; then
    echo "ok|adb_connected|ADB 연결 상태 정상"
    return 0
  fi
  echo "fail|adb_connected|ADB 상태 비정상(${state:-unknown})"
}

check_package() {
  local installed
  installed="$(adb_cmd shell pm path "${PACKAGE}" 2>/dev/null | tr -d '\r' || true)"
  if [[ -n "${installed}" ]]; then
    echo "ok|package_installed|패키지 설치 확인"
    return 0
  fi
  echo "fail|package_installed|패키지 미설치(${PACKAGE})"
}

check_frida_server() {
  local pid
  pid="$(adb_cmd shell pidof frida-server 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
  if [[ -n "${pid}" ]]; then
    echo "ok|frida_server|frida-server 실행 중(pid=${pid})"
    return 0
  fi
  echo "warn|frida_server|frida-server 미실행"
}

check_frida_forward() {
  local forwards
  forwards="$(adb forward --list 2>/dev/null || true)"
  if echo "${forwards}" | rg -q "tcp:${FRIDA_PORT}[[:space:]]+tcp:${FRIDA_PORT}"; then
    echo "ok|frida_forward|adb forward tcp:${FRIDA_PORT} 설정됨"
    return 0
  fi
  echo "warn|frida_forward|adb forward tcp:${FRIDA_PORT}->tcp:${FRIDA_PORT} 없음"
}

check_proxy() {
  local proxy
  proxy="$(adb_cmd shell settings get global http_proxy 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "${proxy}" || "${proxy}" == ":0" || "${proxy}" == "null" ]]; then
    if [[ "${EXPECT_MITM}" == "1" ]]; then
      echo "warn|http_proxy|MITM 예정인데 프록시 미설정"
    else
      echo "ok|http_proxy|프록시 비활성(:0)"
    fi
    return 0
  fi
  echo "ok|http_proxy|프록시 설정(${proxy})"
}

check_root_modules() {
  if [[ "${EXPECT_ROOT_MODULES}" != "1" ]]; then
    echo "skip|root_modules|루트 모듈 확인 생략"
    return 0
  fi
  local mod1 mod2
  mod1="$(adb_cmd shell su -c 'test -d /data/adb/modules/trustusercerts && echo yes || echo no' 2>/dev/null | tr -d '\r' || true)"
  mod2="$(adb_cmd shell su -c 'test -d /data/adb/modules/nccgroup-conscrypt-trustusercerts && echo yes || echo no' 2>/dev/null | tr -d '\r' || true)"
  if [[ "${mod1}" == "yes" && "${mod2}" == "yes" ]]; then
    echo "ok|root_modules|trustusercerts/conscrypt 모듈 확인"
    return 0
  fi
  if [[ "${mod1}" == "yes" || "${mod2}" == "yes" ]]; then
    echo "warn|root_modules|일부 모듈만 확인(mod1=${mod1}, mod2=${mod2})"
    return 0
  fi
  echo "warn|root_modules|루트 모듈 미확인(su 권한/모듈 상태 점검 필요)"
}

check_app_pid() {
  local pid
  pid="$(adb_cmd shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
  if [[ -n "${pid}" ]]; then
    echo "ok|app_running|앱 실행 중(pid=${pid})"
  else
    echo "info|app_running|앱 미실행(실행 시 자동 시작 가능)"
  fi
}

results=()
for fn in \
  check_adb_state \
  check_package \
  check_frida_server \
  check_frida_forward \
  check_proxy \
  check_root_modules \
  check_app_pid
do
  results+=("$(${fn})")
done

fail_count=0
warn_count=0

for row in "${results[@]}"; do
  status="${row%%|*}"
  remain="${row#*|}"
  key="${remain%%|*}"
  msg="${remain#*|}"
  if [[ "${status}" == "fail" ]]; then
    fail_count=$((fail_count + 1))
  elif [[ "${status}" == "warn" ]]; then
    warn_count=$((warn_count + 1))
  fi
  line "[$(printf '%-4s' "${status}")] ${key} - ${msg}"
done

if [[ "${JSON_MODE}" == "1" ]]; then
  printf '{\n'
  printf '  "ts": %s,\n' "$(date +%s)"
  printf '  "package": "%s",\n' "$(json_escape "${PACKAGE}")"
  printf '  "fridaPort": %s,\n' "${FRIDA_PORT}"
  printf '  "expectMitm": %s,\n' "${EXPECT_MITM}"
  printf '  "failCount": %s,\n' "${fail_count}"
  printf '  "warnCount": %s,\n' "${warn_count}"
  printf '  "checks": [\n'
  for i in "${!results[@]}"; do
    row="${results[$i]}"
    status="${row%%|*}"
    remain="${row#*|}"
    key="${remain%%|*}"
    msg="${remain#*|}"
    printf '    {"status":"%s","key":"%s","message":"%s"}' \
      "$(json_escape "${status}")" \
      "$(json_escape "${key}")" \
      "$(json_escape "${msg}")"
    if (( i + 1 < ${#results[@]} )); then
      printf ','
    fi
    printf '\n'
  done
  printf '  ]\n'
  printf '}\n'
fi

if (( fail_count > 0 )); then
  exit 1
fi

