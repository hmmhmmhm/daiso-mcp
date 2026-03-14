#!/usr/bin/env bash
set -euo pipefail

# 세븐일레븐 SignEnc 후킹 캡처 러너
# - 앱 실행 후 attach 모드로 후킹
# - [SE_SIGNENC] 로그를 JSONL로 분리 저장

PACKAGE="kr.co.kork7app"
FRIDA_HOST="127.0.0.1:27042"
PID=""
OUT_DIR=""
PID_RETRY=15
CAPTURE_LOGCAT=1
LOGCAT_PID=""

usage() {
  cat <<'USAGE'
사용법:
  scripts/seveneleven-signenc-capture.sh [옵션]

옵션:
  --package <앱패키지>      기본값: kr.co.kork7app
  --host <frida_host:port>  기본값: 127.0.0.1:27042
  --pid <프로세스PID>       지정 시 PID 고정 attach
  --pid-retry <횟수>        PID 재조회 횟수(초 단위), 기본값: 15
  --out <출력디렉토리>      지정하지 않으면 captures/seveneleven-signenc-YYYYmmdd-HHMMSS
  --no-logcat              adb logcat 동시 수집 비활성화
  -h, --help                도움말 출력
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --host)
      FRIDA_HOST="$2"
      shift 2
      ;;
    --pid)
      PID="$2"
      shift 2
      ;;
    --pid-retry)
      PID_RETRY="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --no-logcat)
      CAPTURE_LOGCAT=0
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

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="captures/seveneleven-signenc-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_DIR}"

RAW_LOG="${OUT_DIR}/frida-signenc-raw.log"
EVENTS_JSONL="${OUT_DIR}/seveneleven-signenc-events.jsonl"
LOGCAT_LOG="${OUT_DIR}/logcat.txt"
SUMMARY_TXT="${OUT_DIR}/summary.txt"
: > "${RAW_LOG}"
: > "${EVENTS_JSONL}"
: > "${SUMMARY_TXT}"

cat > "${OUT_DIR}/README.txt" <<TXT
세븐일레븐 SignEnc/XecureCrypto 캡처 결과

- package: ${PACKAGE}
- pid: ${PID:-auto}
- attach_mode: auto(identifier -> name -> pid)
- pid_retry: ${PID_RETRY}
- host: ${FRIDA_HOST}
- logcat_capture: $([[ "${CAPTURE_LOGCAT}" -eq 1 ]] && echo enabled || echo disabled)
- script: scripts/frida/seveneleven-signenc-hook.js

수집 절차:
1) 앱에서 재고 조회(상품 선택 -> 매장 선택)까지 진행
2) Ctrl+C로 종료
3) ${EVENTS_JSONL}에서 signenc_getencdata_* 이벤트 확인
TXT

get_pid() {
  local raw_pid
  raw_pid="$(adb shell pidof "${PACKAGE}" 2>/dev/null || true)"
  echo "${raw_pid}" | tr -d '\r' | awk '{print $1}'
}

start_logcat_capture() {
  if [[ "${CAPTURE_LOGCAT}" -ne 1 ]]; then
    return
  fi

  : > "${LOGCAT_LOG}"
  adb logcat -c >/dev/null 2>&1 || true
  adb logcat -v time > "${LOGCAT_LOG}" 2>&1 &
  LOGCAT_PID="$!"
}

stop_logcat_capture() {
  if [[ -n "${LOGCAT_PID}" ]]; then
    kill "${LOGCAT_PID}" >/dev/null 2>&1 || true
    wait "${LOGCAT_PID}" >/dev/null 2>&1 || true
    LOGCAT_PID=""
  fi
}

write_summary() {
  {
    echo "세븐일레븐 SignEnc 캡처 요약"
    echo
    echo "- package: ${PACKAGE}"
    echo "- host: ${FRIDA_HOST}"
    echo "- pid_mode: ${PID:-auto}"
    echo "- logcat_capture: $([[ "${CAPTURE_LOGCAT}" -eq 1 ]] && echo enabled || echo disabled)"
    echo

    if rg -q 'TypeError:|ReferenceError:|SyntaxError:' "${RAW_LOG}"; then
      echo "- frida_script_error: detected"
      rg -n 'TypeError:|ReferenceError:|SyntaxError:' "${RAW_LOG}" -N | head -n 5
    else
      echo "- frida_script_error: none"
    fi

    if rg -q 'Process terminated|Failed to attach|Failed to spawn' "${RAW_LOG}"; then
      echo "- frida_attach_status: failed_or_terminated"
      rg -n 'Process terminated|Failed to attach|Failed to spawn' "${RAW_LOG}" -N | head -n 10
    else
      echo "- frida_attach_status: no_failure_marker"
    fi

    if [[ "${CAPTURE_LOGCAT}" -eq 1 ]]; then
      echo
      echo "- appiron_markers:"
      local markers
      markers="$(rg -n \
        'AppIron|FRIDA_T|Tracer|verifyJni|Anti-Debug|detect_frida_threads|Debugger activity|Detected Tracer' \
        "${LOGCAT_LOG}" -N -S | head -n 20 || true)"
      if [[ -n "${markers}" ]]; then
        printf '%s\n' "${markers}"
      else
        echo "none"
      fi
    fi
  } > "${SUMMARY_TXT}"
}

cleanup() {
  stop_logcat_capture

  if [[ ! -s "${EVENTS_JSONL}" && -s "${RAW_LOG}" ]]; then
    awk '/\[SE_SIGNENC\] /{ sub(/^.*\[SE_SIGNENC\] /, ""); print; }' "${RAW_LOG}" \
      > "${EVENTS_JSONL}" || true
  fi

  write_summary
}

trap cleanup EXIT

run_frida_capture() {
  local mode="$1"
  local target="$2"
  local rc=0

  echo "[INFO] attach mode=${mode} target=${target}" | tee -a "${RAW_LOG}"
  set +e
  frida -H "${FRIDA_HOST}" "${mode}" "${target}" -l scripts/frida/seveneleven-signenc-hook.js 2>&1 \
    | tee -a "${RAW_LOG}" \
    | awk '/\[SE_SIGNENC\] /{ sub(/^.*\[SE_SIGNENC\] /, ""); print; fflush(); }' \
    | tee -a "${EVENTS_JSONL}"
  rc=${PIPESTATUS[0]}
  set -e

  # Ctrl+C로 정상 종료한 경우(130)는 성공으로 간주
  if [[ "${rc}" -eq 130 ]]; then
    return 0
  fi
  return "${rc}"
}

echo "출력 디렉토리: ${OUT_DIR}"
echo "대상 패키지: ${PACKAGE}"
echo "Raw 로그: ${RAW_LOG}"
echo "이벤트 JSONL: ${EVENTS_JSONL}"
if [[ "${CAPTURE_LOGCAT}" -eq 1 ]]; then
  echo "Logcat 로그: ${LOGCAT_LOG}"
fi
echo "요약: ${SUMMARY_TXT}"
echo "종료: Ctrl+C"

start_logcat_capture

if [[ -n "${PID}" ]]; then
  if ! run_frida_capture "-p" "${PID}"; then
    echo "PID attach 실패: ${PID}" >&2
    exit 1
  fi
else
  # 1순위: 앱 식별자(패키지명) 기준 attach
  if run_frida_capture "-N" "${PACKAGE}"; then
    true
  # 2순위: 프로세스명 attach
  elif run_frida_capture "-n" "${PACKAGE}"; then
    true
  else
    # 3순위: PID 재조회 attach
    echo "[INFO] identifier/name attach 실패, PID 재조회 폴백 시작" | tee -a "${RAW_LOG}"
    attempt=1
    while [[ "${attempt}" -le "${PID_RETRY}" ]]; do
      current_pid="$(get_pid)"
      if [[ -n "${current_pid}" ]]; then
        if run_frida_capture "-p" "${current_pid}"; then
          break
        fi
      fi

      if [[ "${attempt}" -eq "${PID_RETRY}" ]]; then
        echo "attach 실패: 식별자/이름/PID 재시도(${PID_RETRY}회) 모두 실패" >&2
        exit 1
      fi

      echo "[INFO] PID 재조회 대기 중... (${attempt}/${PID_RETRY})" | tee -a "${RAW_LOG}"
      sleep 1
      attempt=$((attempt + 1))
    done
  fi
fi
