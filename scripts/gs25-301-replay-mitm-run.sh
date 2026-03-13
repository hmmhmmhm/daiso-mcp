#!/usr/bin/env bash
set -euo pipefail

# GS25 301 replay 실험용 mitmdump 러너
# - injector + capture_export 동시 로딩
# - 지정 시간 후 자동 종료
# - raw 로그/요약 파일 저장

HOSTS="api16-access-sg.pangle.io,api16-access-wf-sg.pangle.io,api-access.pangolin-sdk-toutiao.com"
MODE="replace_wrapper_f5_now"
TUPLE_FILE=""
TUPLE_INDEX="0"
DURATION_SEC="90"
OUT_DIR=""
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
AUTO_FLOW="0"
FLOW_SCRIPT="scripts/gs25-stock-flow-uiautomator.sh"
PROXY_PORT="8080"
PROXY_HOST=""
RESTORE_PROXY="1"
FRIDA_SSL_BYPASS="0"
FRIDA_SCRIPTS="scripts/frida/android-ssl-bypass.js"
FRIDA_LOG_NAME="frida-ssl-bypass.log"
PACKAGE_NAME="${PACKAGE_NAME:-com.gsr.gs25}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-301-replay-mitm-run.sh --tuple <replay-tuples.json> [옵션]

옵션:
  --tuple <파일>          replay tuple JSON 파일 (필수)
  --index <정수>          tuple 인덱스 (기본: 0)
  --mode <모드>           replace_wrapper | replace_wrapper_f5_now | replace_field4_keep_current
  --hosts <CSV>           대상 호스트 목록
  --duration <초>         mitmdump 실행 시간 (기본: 90)
  --device <serial>       adb 디바이스 시리얼 (미지정 시 기본 디바이스)
  --auto-flow             mitm 실행 중 GS25 UI 재현 스크립트 자동 실행
  --flow-script <경로>    auto-flow 스크립트 (기본: scripts/gs25-stock-flow-uiautomator.sh)
  --proxy-host <IP>       기기 프록시 호스트 (기본: en0 IP 자동 탐색)
  --proxy-port <포트>     기기 프록시 포트 (기본: 8080)
  --no-restore-proxy      종료 시 기기 프록시 원복 비활성화
  --frida-ssl-bypass      Frida PID attach로 SSL 우회 스크립트 병행 주입
  --frida-scripts <CSV>   주입할 Frida 스크립트 목록 (기본: android-ssl-bypass.js)
  --package <식별자>      앱 패키지명 (기본: com.gsr.gs25)
  --out <디렉터리>        출력 디렉터리 (기본: captures/gs25-301-replay-run-YYYYmmdd-HHMMSS)
  -h, --help              도움말
EOF
}

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

resolve_proxy_host() {
  if [[ -n "${PROXY_HOST}" ]]; then
    echo "${PROXY_HOST}"
    return 0
  fi
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [[ -z "${ip}" ]]; then
    ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  echo "${ip}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tuple)
      TUPLE_FILE="$2"
      shift 2
      ;;
    --index)
      TUPLE_INDEX="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --hosts)
      HOSTS="$2"
      shift 2
      ;;
    --duration)
      DURATION_SEC="$2"
      shift 2
      ;;
    --device)
      DEVICE_SERIAL="$2"
      shift 2
      ;;
    --auto-flow)
      AUTO_FLOW="1"
      shift 1
      ;;
    --flow-script)
      FLOW_SCRIPT="$2"
      shift 2
      ;;
    --proxy-host)
      PROXY_HOST="$2"
      shift 2
      ;;
    --proxy-port)
      PROXY_PORT="$2"
      shift 2
      ;;
    --no-restore-proxy)
      RESTORE_PROXY="0"
      shift 1
      ;;
    --frida-ssl-bypass)
      FRIDA_SSL_BYPASS="1"
      shift 1
      ;;
    --frida-scripts)
      FRIDA_SCRIPTS="$2"
      shift 2
      ;;
    --package)
      PACKAGE_NAME="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
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

if [[ -z "${TUPLE_FILE}" ]]; then
  echo "--tuple 옵션은 필수입니다." >&2
  usage
  exit 1
fi

if [[ ! -f "${TUPLE_FILE}" ]]; then
  echo "tuple 파일을 찾지 못했습니다: ${TUPLE_FILE}" >&2
  exit 1
fi

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="captures/gs25-301-replay-run-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_DIR}"

RAW_LOG="${OUT_DIR}/mitmdump-replay-raw.log"
CAP_DIR="${OUT_DIR}/capture-export"
mkdir -p "${CAP_DIR}"

ORIG_HTTP_PROXY=""
ORIG_PROXY_HOST=""
ORIG_PROXY_PORT=""
ORIG_PROXY_EXCL=""
PROXY_APPLIED="0"

apply_device_proxy() {
  local host="$1"
  if [[ -z "${host}" ]]; then
    echo "프록시 호스트 자동 탐색 실패: --proxy-host로 지정하세요." >&2
    return 1
  fi
  ORIG_HTTP_PROXY="$(adb_cmd shell settings get global http_proxy 2>/dev/null | tr -d '\r' || true)"
  ORIG_PROXY_HOST="$(adb_cmd shell settings get global global_http_proxy_host 2>/dev/null | tr -d '\r' || true)"
  ORIG_PROXY_PORT="$(adb_cmd shell settings get global global_http_proxy_port 2>/dev/null | tr -d '\r' || true)"
  ORIG_PROXY_EXCL="$(adb_cmd shell settings get global global_http_proxy_exclusion_list 2>/dev/null | tr -d '\r' || true)"

  adb_cmd shell settings put global http_proxy "${host}:${PROXY_PORT}"
  adb_cmd shell settings put global global_http_proxy_host "${host}"
  adb_cmd shell settings put global global_http_proxy_port "${PROXY_PORT}"
  PROXY_APPLIED="1"
}

restore_device_proxy() {
  if [[ "${PROXY_APPLIED}" != "1" ]]; then
    return 0
  fi
  if [[ "${RESTORE_PROXY}" != "1" ]]; then
    return 0
  fi

  if [[ -n "${ORIG_HTTP_PROXY}" ]]; then
    adb_cmd shell settings put global http_proxy "${ORIG_HTTP_PROXY}" || true
  else
    adb_cmd shell settings put global http_proxy ":0" || true
  fi
  if [[ -n "${ORIG_PROXY_HOST}" && "${ORIG_PROXY_HOST}" != "null" ]]; then
    adb_cmd shell settings put global global_http_proxy_host "${ORIG_PROXY_HOST}" || true
  else
    adb_cmd shell settings delete global global_http_proxy_host || true
  fi
  if [[ -n "${ORIG_PROXY_PORT}" && "${ORIG_PROXY_PORT}" != "null" ]]; then
    adb_cmd shell settings put global global_http_proxy_port "${ORIG_PROXY_PORT}" || true
  else
    adb_cmd shell settings delete global global_http_proxy_port || true
  fi
  if [[ -n "${ORIG_PROXY_EXCL}" && "${ORIG_PROXY_EXCL}" != "null" ]]; then
    adb_cmd shell settings put global global_http_proxy_exclusion_list "${ORIG_PROXY_EXCL}" || true
  else
    adb_cmd shell settings delete global global_http_proxy_exclusion_list || true
  fi
}

echo "출력 디렉터리: ${OUT_DIR}"
echo "tuple 파일: ${TUPLE_FILE}"
echo "mode: ${MODE}"
echo "duration: ${DURATION_SEC}s"
echo "hosts: ${HOSTS}"
echo "auto-flow: ${AUTO_FLOW}"
if [[ -n "${DEVICE_SERIAL}" ]]; then
  echo "device: ${DEVICE_SERIAL}"
fi
echo "frida-ssl-bypass: ${FRIDA_SSL_BYPASS}"

mitmdump \
  -s scripts/mitm/gs25_301_replay_injector.py \
  -s scripts/mitmproxy/gs25_capture_export.py \
  --set gs25_replay_enable=true \
  --set "gs25_replay_tuple_file=${TUPLE_FILE}" \
  --set "gs25_replay_tuple_index=${TUPLE_INDEX}" \
  --set "gs25_replay_mode=${MODE}" \
  --set "gs25_replay_hosts=${HOSTS}" \
  --set "gs25_capture_dir=${CAP_DIR}" \
  --set "gs25_capture_scenario=301 replay campaign (${MODE})" \
  --set "gs25_capture_hosts=${HOSTS}" \
  > "${RAW_LOG}" 2>&1 &
MITM_PID=$!

cleanup() {
  if [[ -n "${FRIDA_CLI_PID}" ]] && kill -0 "${FRIDA_CLI_PID}" 2>/dev/null; then
    kill "${FRIDA_CLI_PID}" 2>/dev/null || true
    wait "${FRIDA_CLI_PID}" 2>/dev/null || true
  fi
  if [[ -n "${FLOW_PID}" ]] && kill -0 "${FLOW_PID}" 2>/dev/null; then
    kill "${FLOW_PID}" 2>/dev/null || true
    wait "${FLOW_PID}" 2>/dev/null || true
  fi
  if kill -0 "${MITM_PID}" 2>/dev/null; then
    kill "${MITM_PID}" 2>/dev/null || true
    wait "${MITM_PID}" 2>/dev/null || true
  fi
  restore_device_proxy
}
FLOW_PID=""
FRIDA_CLI_PID=""
trap cleanup EXIT INT TERM

sleep 2

if [[ "${FRIDA_SSL_BYPASS}" == "1" ]]; then
  # 앱 프로세스가 없으면 실행 후 PID를 재조회합니다.
  APP_PID="$(frida-ps -Uai | awk -v pkg="${PACKAGE_NAME}" '$0 ~ pkg {print $1; exit}')"
  if [[ -z "${APP_PID}" ]]; then
    adb_cmd shell monkey -p "${PACKAGE_NAME}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    sleep 2
    APP_PID="$(frida-ps -Uai | awk -v pkg="${PACKAGE_NAME}" '$0 ~ pkg {print $1; exit}')"
  fi
  if [[ -z "${APP_PID}" ]]; then
    echo "Frida attach 실패: 앱 PID를 찾지 못했습니다 (${PACKAGE_NAME})" >&2
  else
    FRIDA_LOG="${OUT_DIR}/${FRIDA_LOG_NAME}"
    IFS=',' read -r -a frida_script_arr <<< "${FRIDA_SCRIPTS}"
    frida_cmd=(frida -U -p "${APP_PID}" -q -t "$((DURATION_SEC + 15))")
    for script in "${frida_script_arr[@]}"; do
      script="$(echo "${script}" | xargs)"
      [[ -n "${script}" ]] || continue
      frida_cmd+=(-l "${script}")
    done
    "${frida_cmd[@]}" > "${FRIDA_LOG}" 2>&1 &
    FRIDA_CLI_PID=$!
    echo "frida attach 시작: pid=${APP_PID}, log=${FRIDA_LOG}"
  fi
fi

if [[ "${AUTO_FLOW}" == "1" ]]; then
  PROXY_HOST_RESOLVED="$(resolve_proxy_host)"
  echo "device proxy 적용: ${PROXY_HOST_RESOLVED}:${PROXY_PORT}"
  apply_device_proxy "${PROXY_HOST_RESOLVED}"
  if [[ ! -x "${FLOW_SCRIPT}" ]]; then
    echo "flow script 실행 권한 부여: ${FLOW_SCRIPT}"
    chmod +x "${FLOW_SCRIPT}" || true
  fi
  (
    export DEVICE_SERIAL="${DEVICE_SERIAL}"
    "${FLOW_SCRIPT}"
  ) >> "${RAW_LOG}" 2>&1 &
  FLOW_PID=$!
fi

sleep "${DURATION_SEC}"
cleanup
trap - EXIT INT TERM

echo "완료: ${RAW_LOG}"
echo "다음 명령으로 요약하세요:"
echo "  node scripts/gs25-301-replay-result-summary.mjs ${RAW_LOG}"
