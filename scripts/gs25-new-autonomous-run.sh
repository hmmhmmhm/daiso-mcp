#!/usr/bin/env bash
set -euo pipefail

# GS25 New 자율 오케스트레이터
# - 라운드 단위로 캡처/후킹/UI 재현/요약을 자동 반복
# - 사람이 중간 개입하지 않는 실행을 기본 가정

ROUNDS="6"
TARGET_SUCCESS="3"
WINDOW_SEC="120"
PROFILES="baseline,flutter_tls,patch_cycle"
OUT_ROOT=""
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
FRIDA_HOST="${FRIDA_HOST:-127.0.0.1:27042}"
UI_SCRIPT="scripts/gs25-stock-flow-uiautomator.sh"
SSL_BYPASS_SCRIPT=""
WITH_MITM="0"
PROXY_HOST=""
PROXY_PORT="8080"
REPLAY_CHECK="0"
DRY_RUN="0"
SLEEP_BETWEEN_ROUNDS="5"
PREFLIGHT="1"
MITM_IGNORE_HOSTS='(^(.+\\.)?google\\.com(:[0-9]+)?$)|(^(.+\\.)?gstatic\\.com(:[0-9]+)?$)|(^play\\.googleapis\\.com(:[0-9]+)?$)'
DISABLE_CAPTIVE_CHECK="1"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-new-autonomous-run.sh [옵션]

옵션:
  --rounds <N>                 총 라운드 수 (기본: 6)
  --target-success <N>         목표 성공 라운드 수 (기본: 3)
  --window <초>                라운드 캡처 윈도우 (기본: 120)
  --profiles <CSV>             프로파일 순환 목록 (기본: baseline,flutter_tls,patch_cycle)
  --out <디렉터리>             출력 루트 (기본: captures/gs25-new-autonomous-YYYYmmdd-HHMMSS)
  --device <serial>            adb 디바이스 시리얼
  --package <앱패키지>         기본: com.gsr.gs25
  --host <frida_host:port>     기본: 127.0.0.1:27042
  --ui-script <경로>           UI 자동화 스크립트 (기본: gs25-stock-flow-uiautomator.sh)
  --ssl-bypass-script <CSV>    라운드 내 Frida SSL bypass 스크립트 목록
  --with-mitm                  mitmdump 캡처 병행
  --proxy-host <IP>            기기 프록시 호스트 (미지정 시 en0/en1 자동 탐색)
  --proxy-port <포트>          기기 프록시 포트 (기본: 8080)
  --mitm-ignore-hosts <re>     mitm 무시 호스트 정규식
  --disable-captive-check <0|1>  캡티브 포털 체크 비활성화(기본: 1)
  --replay-check               라운드 종료 후 301 replay 체크 수행
  --sleep-between <초>         라운드 간 대기 (기본: 5)
  --skip-preflight            시작 전 preflight 점검 생략
  --dry-run                    명령 실행 없이 계획만 출력
  -h, --help                   도움말
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rounds)
      ROUNDS="$2"
      shift 2
      ;;
    --target-success)
      TARGET_SUCCESS="$2"
      shift 2
      ;;
    --window)
      WINDOW_SEC="$2"
      shift 2
      ;;
    --profiles)
      PROFILES="$2"
      shift 2
      ;;
    --out)
      OUT_ROOT="$2"
      shift 2
      ;;
    --device)
      DEVICE_SERIAL="$2"
      shift 2
      ;;
    --package)
      PACKAGE="$2"
      shift 2
      ;;
    --host)
      FRIDA_HOST="$2"
      shift 2
      ;;
    --ui-script)
      UI_SCRIPT="$2"
      shift 2
      ;;
    --ssl-bypass-script)
      SSL_BYPASS_SCRIPT="$2"
      shift 2
      ;;
    --with-mitm)
      WITH_MITM="1"
      shift 1
      ;;
    --proxy-host)
      PROXY_HOST="$2"
      shift 2
      ;;
    --proxy-port)
      PROXY_PORT="$2"
      shift 2
      ;;
    --mitm-ignore-hosts)
      MITM_IGNORE_HOSTS="$2"
      shift 2
      ;;
    --disable-captive-check)
      DISABLE_CAPTIVE_CHECK="$2"
      shift 2
      ;;
    --replay-check)
      REPLAY_CHECK="1"
      shift 1
      ;;
    --sleep-between)
      SLEEP_BETWEEN_ROUNDS="$2"
      shift 2
      ;;
    --skip-preflight)
      PREFLIGHT="0"
      shift 1
      ;;
    --dry-run)
      DRY_RUN="1"
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

if [[ -z "${OUT_ROOT}" ]]; then
  OUT_ROOT="captures/gs25-new-autonomous-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "${OUT_ROOT}"
RUN_LOG="${OUT_ROOT}/agent-run.log"
MANIFEST="${OUT_ROOT}/manifest.jsonl"
touch "${MANIFEST}"

log() {
  local msg="$1"
  printf '[%s] %s\n' "$(date '+%F %T')" "${msg}" | tee -a "${RUN_LOG}"
}

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
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

PROXY_APPLIED="0"
ORIG_HTTP_PROXY=""
CAPTIVE_MODE_APPLIED="0"
ORIG_CAPTIVE_MODE=""
restore_proxy() {
  if [[ "${PROXY_APPLIED}" != "1" || "${DRY_RUN}" == "1" ]]; then
    :
  else
    if [[ -n "${ORIG_HTTP_PROXY}" ]]; then
      adb_cmd shell settings put global http_proxy "${ORIG_HTTP_PROXY}" >/dev/null 2>&1 || true
    else
      adb_cmd shell settings put global http_proxy ":0" >/dev/null 2>&1 || true
    fi
  fi
  if [[ "${CAPTIVE_MODE_APPLIED}" == "1" && "${DRY_RUN}" != "1" ]]; then
    if [[ -n "${ORIG_CAPTIVE_MODE}" && "${ORIG_CAPTIVE_MODE}" != "null" ]]; then
      adb_cmd shell settings put global captive_portal_mode "${ORIG_CAPTIVE_MODE}" >/dev/null 2>&1 || true
    else
      adb_cmd shell settings delete global captive_portal_mode >/dev/null 2>&1 || true
    fi
    log "captive_portal_mode 복구: ${ORIG_CAPTIVE_MODE:-unset}"
    CAPTIVE_MODE_APPLIED="0"
    ORIG_CAPTIVE_MODE=""
  fi
}

apply_captive_portal_tweak_if_needed() {
  if [[ "${WITH_MITM}" != "1" || "${DISABLE_CAPTIVE_CHECK}" != "1" ]]; then
    return 0
  fi
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] adb shell settings put global captive_portal_mode 0"
    return 0
  fi
  ORIG_CAPTIVE_MODE="$(adb_cmd shell settings get global captive_portal_mode 2>/dev/null | tr -d '\r' || true)"
  adb_cmd shell settings put global captive_portal_mode 0 >/dev/null 2>&1 || true
  CAPTIVE_MODE_APPLIED="1"
  log "captive_portal_mode 적용: 0 (orig=${ORIG_CAPTIVE_MODE:-unset})"
}

apply_proxy_if_needed() {
  if [[ "${WITH_MITM}" != "1" ]]; then
    return 0
  fi
  local host
  host="$(resolve_proxy_host)"
  if [[ -z "${host}" ]]; then
    log "프록시 호스트 자동 탐색 실패"
    return 1
  fi
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] adb shell settings put global http_proxy ${host}:${PROXY_PORT}"
    return 0
  fi
  ORIG_HTTP_PROXY="$(adb_cmd shell settings get global http_proxy 2>/dev/null | tr -d '\r' || true)"
  adb_cmd shell settings put global http_proxy "${host}:${PROXY_PORT}"
  PROXY_APPLIED="1"
  log "기기 프록시 적용: ${host}:${PROXY_PORT}"
}

cleanup_pids() {
  for pid in "$@"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

append_manifest() {
  local summary_file="$1"
  node - <<'JS' "${MANIFEST}" "${summary_file}"
const fs = require('fs');
const [manifestPath, summaryPath] = process.argv.slice(2);
const obj = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
fs.appendFileSync(manifestPath, JSON.stringify(obj) + '\n');
JS
}

extract_field() {
  local summary_file="$1"
  local field="$2"
  node - <<'JS' "${summary_file}" "${field}"
const fs = require('fs');
const [summaryPath, field] = process.argv.slice(2);
const obj = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const parts = field.split('.');
let cur = obj;
for (const p of parts) cur = cur && Object.prototype.hasOwnProperty.call(cur, p) ? cur[p] : null;
if (cur === null || cur === undefined) process.stdout.write('');
else process.stdout.write(String(cur));
JS
}

run_round() {
  local round_no="$1"
  local profile="$2"
  local round_dir="$3"

  mkdir -p "${round_dir}"
  local round_log="${round_dir}/round.log"
  local b2c_dir="${round_dir}/b2c-native"
  local pgl_dir="${round_dir}/pgl-301-pipeline"
  local mitm_dir="${round_dir}/mitm"
  mkdir -p "${b2c_dir}" "${pgl_dir}" "${mitm_dir}"

  log "round ${round_no} 시작 (profile=${profile})"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] 캡처/후킹/UI/요약 단계 출력만 수행"
  else
    bash scripts/gs25-new-round-runner.sh \
      --round-log "${round_log}" \
      --pgl-dir "${pgl_dir}" \
      --b2c-dir "${b2c_dir}" \
      --mitm-dir "${mitm_dir}" \
      --host "${FRIDA_HOST}" \
      --package "${PACKAGE}" \
      --ui-script "${UI_SCRIPT}" \
      --ssl-bypass-script "${SSL_BYPASS_SCRIPT}" \
      --window "${WINDOW_SEC}" \
      --with-mitm "${WITH_MITM}" \
      --mitm-ignore-hosts "${MITM_IGNORE_HOSTS}" \
      --scenario "gs25-new round ${round_no} ${profile}" \
      --device "${DEVICE_SERIAL}"
  fi

  local b2c_events="${b2c_dir}/gs25-b2c-native-events.jsonl"
  if [[ -s "${b2c_events}" ]]; then
    node scripts/gs25-b2c-native-events-summary.mjs "${b2c_events}" \
      > "${round_dir}/b2c-summary.json"
  else
    log "round ${round_no}: b2c events 없음"
  fi

  local pgl_raw="${pgl_dir}/frida-pgl-meta-301-pipeline-raw.log"
  local pgl_java="${pgl_dir}/gs25-pgl-meta-events.jsonl"
  local pgl_pipe="${pgl_dir}/gs25-pgl-meta-301-pipeline-events.jsonl"

  if [[ -s "${pgl_raw}" ]]; then
    node scripts/gs25-pgl-meta-301-pipeline-extract.mjs "${pgl_raw}" "${pgl_java}" "${pgl_pipe}" \
      > "${round_dir}/pipeline-extract-summary.json"
  else
    log "round ${round_no}: pipeline raw 로그 없음"
  fi

  if [[ -s "${pgl_java}" ]]; then
    node scripts/gs25-pgl-meta-summary.mjs "${pgl_java}" > "${round_dir}/pgl-meta-summary.json"
  fi

  local tuple_file="${round_dir}/301-replay-tuples.json"
  if [[ -s "${pgl_pipe}" ]]; then
    node scripts/gs25-pgl-meta-301-export-replay-tuples.mjs "${pgl_pipe}" --out "${tuple_file}" \
      > "${round_dir}/tuple-export.log"
  fi

  if [[ "${REPLAY_CHECK}" == "1" && -s "${tuple_file}" ]]; then
    local replay_dir="${round_dir}/301-replay-check"
    mkdir -p "${replay_dir}"
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "[dry-run] replay-check 실행 생략"
    else
      # replay-check 서브러너가 멈출 수 있어 상한 시간을 강제한다.
      run_with_timeout 120 bash scripts/gs25-301-replay-mitm-run.sh \
        --tuple "${tuple_file}" \
        --index 0 \
        --duration 45 \
        --out "${replay_dir}" \
        > "${round_dir}/replay-check.log" 2>&1 || true
    fi
    if [[ -s "${replay_dir}/mitmdump-replay-raw.log" ]]; then
      node scripts/gs25-301-replay-result-summary.mjs \
        "${replay_dir}/mitmdump-replay-raw.log" \
        > "${round_dir}/301-replay-summary.json"
    fi
  fi

  local summary_file="${round_dir}/round-summary.json"
  node scripts/gs25-new-round-summary.mjs "${round_dir}" --profile "${profile}" --out "${summary_file}" \
    > "${round_dir}/round-summary.log"
  append_manifest "${summary_file}"
}

finalize_summary() {
  local out_json="${OUT_ROOT}/final-summary.json"
  node - <<'JS' "${MANIFEST}" "${out_json}"
const fs = require('fs');
const [manifestPath, outPath] = process.argv.slice(2);
const lines = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').filter(Boolean);
const rows = lines.map((l) => JSON.parse(l));
const roundCount = rows.length;
const successCount = rows.filter((r) => r.isRoundSuccess).length;
const b2cSeenRounds = rows.filter((r) => r.b2cSeen).length;
const tupleTotal = rows.reduce((acc, r) => acc + Number(r.tupleCount || 0), 0);
const replaySuccessTotal = rows.reduce((acc, r) => acc + Number(r.replaySuccessCount || 0), 0);
const last = rows[rows.length - 1] || null;
const final = {
  ts: Date.now(),
  manifestPath,
  roundCount,
  successCount,
  b2cSeenRounds,
  tupleTotal,
  replaySuccessTotal,
  lastRound: last,
};
fs.writeFileSync(outPath, JSON.stringify(final, null, 2) + '\n');
console.log(outPath);
JS
}

trap 'cleanup_pids; restore_proxy' EXIT

log "gs25-new 자율 실행 시작"
log "out=${OUT_ROOT} rounds=${ROUNDS} targetSuccess=${TARGET_SUCCESS} window=${WINDOW_SEC}s"
log "profiles=${PROFILES} withMitm=${WITH_MITM} replayCheck=${REPLAY_CHECK} dryRun=${DRY_RUN}"
log "mitmIgnoreHosts=${MITM_IGNORE_HOSTS}"
log "disableCaptiveCheck=${DISABLE_CAPTIVE_CHECK}"

if [[ "${PREFLIGHT}" == "1" ]]; then
  log "preflight 점검 시작"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] scripts/gs25-new-preflight-check.sh --expect-mitm ${WITH_MITM}"
  else
    if ! bash scripts/gs25-new-preflight-check.sh \
      --device "${DEVICE_SERIAL}" \
      --package "${PACKAGE}" \
      --expect-mitm "${WITH_MITM}" \
      --json > "${OUT_ROOT}/preflight.json"; then
      log "preflight 실패: ${OUT_ROOT}/preflight.json 확인"
      exit 1
    fi
    log "preflight 완료: ${OUT_ROOT}/preflight.json"
  fi
fi

apply_proxy_if_needed || true
apply_captive_portal_tweak_if_needed || true

IFS=',' read -r -a profile_arr <<< "${PROFILES}"
if [[ "${#profile_arr[@]}" -eq 0 ]]; then
  echo "profiles가 비어 있습니다." >&2
  exit 1
fi

success_rounds=0
for ((i = 1; i <= ROUNDS; i += 1)); do
  idx=$(( (i - 1) % ${#profile_arr[@]} ))
  profile="${profile_arr[$idx]}"
  round_dir="${OUT_ROOT}/round-$(printf '%02d' "${i}")-${profile}"

  run_round "${i}" "${profile}" "${round_dir}"

  summary_file="${round_dir}/round-summary.json"
  round_success="$(extract_field "${summary_file}" "isRoundSuccess")"
  tuple_count="$(extract_field "${summary_file}" "tupleCount")"
  next_action="$(extract_field "${summary_file}" "nextAction")"
  log "round ${i} 요약: isRoundSuccess=${round_success} tupleCount=${tuple_count} nextAction=${next_action}"

  if [[ "${round_success}" == "true" ]]; then
    success_rounds=$((success_rounds + 1))
  fi
  if (( success_rounds >= TARGET_SUCCESS )); then
    log "목표 성공 라운드 수 도달: ${success_rounds}/${TARGET_SUCCESS}"
    break
  fi

  if (( i < ROUNDS )); then
    sleep "${SLEEP_BETWEEN_ROUNDS}"
  fi
done

finalize_summary > "${OUT_ROOT}/final-summary.path"
restore_proxy
log "gs25-new 자율 실행 종료"
log "manifest=${MANIFEST}"
log "final-summary=$(cat "${OUT_ROOT}/final-summary.path")"
