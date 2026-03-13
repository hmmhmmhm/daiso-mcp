#!/usr/bin/env bash
set -euo pipefail

# GS25 301 replay 배치 실험 러너
# - tuple 파일/인덱스/모드 조합을 순차 실행
# - 각 런 summary + 전체 집계(manifest.json) 생성

HOSTS="api16-access-sg.pangle.io,api16-access-wf-sg.pangle.io,api-access.pangolin-sdk-toutiao.com"
DURATION_SEC="90"
OUT_ROOT=""
TUPLE_SPECS=""
MODES="replace_wrapper_f5_now"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
AUTO_FLOW="0"
FLOW_SCRIPT="scripts/gs25-stock-flow-uiautomator.sh"
PROXY_HOST=""
PROXY_PORT="8080"
RESTORE_PROXY="1"
FRIDA_SSL_BYPASS="0"
FRIDA_SCRIPTS="scripts/frida/android-ssl-bypass.js"
PACKAGE_NAME="${PACKAGE_NAME:-com.gsr.gs25}"

usage() {
  cat <<'EOF'
사용법:
  scripts/gs25-301-replay-batch-run.sh --tuples <file:index[,file:index...]> [옵션]

옵션:
  --tuples <명세>          필수. 예) a.json:0,b.json:1
  --modes <CSV>            기본: replace_wrapper_f5_now
                           예) replace_wrapper_f5_now,replace_field4_keep_current
  --hosts <CSV>            대상 호스트
  --duration <초>          런당 실행 시간(기본 90)
  --device <serial>        adb 디바이스 시리얼
  --auto-flow              런마다 UI 재현 + 프록시 자동설정 수행
  --flow-script <경로>     auto-flow 스크립트 (기본: scripts/gs25-stock-flow-uiautomator.sh)
  --proxy-host <IP>        기기 프록시 호스트 (기본: en0 자동 탐색)
  --proxy-port <포트>      기기 프록시 포트 (기본: 8080)
  --no-restore-proxy       종료 시 프록시 원복 비활성화
  --frida-ssl-bypass       Frida SSL 우회 스크립트 병행 주입
  --frida-scripts <CSV>    Frida 스크립트 목록
  --package <식별자>       앱 패키지명 (기본: com.gsr.gs25)
  --out <디렉터리>         기본: captures/gs25-301-replay-batch-YYYYmmdd-HHMMSS
  -h, --help               도움말
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tuples)
      TUPLE_SPECS="$2"
      shift 2
      ;;
    --modes)
      MODES="$2"
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
      OUT_ROOT="$2"
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

if [[ -z "${TUPLE_SPECS}" ]]; then
  echo "--tuples 옵션은 필수입니다." >&2
  usage
  exit 1
fi

if [[ -z "${OUT_ROOT}" ]]; then
  OUT_ROOT="captures/gs25-301-replay-batch-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "${OUT_ROOT}"

MANIFEST="${OUT_ROOT}/manifest.jsonl"
: > "${MANIFEST}"

IFS=',' read -r -a tuple_arr <<< "${TUPLE_SPECS}"
IFS=',' read -r -a mode_arr <<< "${MODES}"

run_no=0
for spec in "${tuple_arr[@]}"; do
  tuple_file="${spec%%:*}"
  tuple_idx="${spec##*:}"
  if [[ "${tuple_file}" == "${tuple_idx}" ]]; then
    tuple_idx="0"
  fi
  if [[ ! -f "${tuple_file}" ]]; then
    echo "tuple 파일을 찾지 못했습니다: ${tuple_file}" >&2
    continue
  fi
  for mode in "${mode_arr[@]}"; do
    run_no=$((run_no + 1))
    run_dir="${OUT_ROOT}/run-${run_no}-$(basename "${tuple_file}" .json)-idx${tuple_idx}-${mode}"
    mkdir -p "${run_dir}"
    echo "[run ${run_no}] tuple=${tuple_file}:${tuple_idx} mode=${mode}"

    run_args=(
      --tuple "${tuple_file}"
      --index "${tuple_idx}"
      --mode "${mode}"
      --hosts "${HOSTS}"
      --duration "${DURATION_SEC}"
      --flow-script "${FLOW_SCRIPT}"
      --proxy-port "${PROXY_PORT}"
      --out "${run_dir}"
    )
    if [[ -n "${DEVICE_SERIAL}" ]]; then
      run_args+=(--device "${DEVICE_SERIAL}")
    fi
    if [[ "${AUTO_FLOW}" == "1" ]]; then
      run_args+=(--auto-flow)
    fi
    if [[ -n "${PROXY_HOST}" ]]; then
      run_args+=(--proxy-host "${PROXY_HOST}")
    fi
    if [[ "${RESTORE_PROXY}" != "1" ]]; then
      run_args+=(--no-restore-proxy)
    fi
    if [[ "${FRIDA_SSL_BYPASS}" == "1" ]]; then
      run_args+=(--frida-ssl-bypass)
    fi
    if [[ -n "${FRIDA_SCRIPTS}" ]]; then
      run_args+=(--frida-scripts "${FRIDA_SCRIPTS}")
    fi
    if [[ -n "${PACKAGE_NAME}" ]]; then
      run_args+=(--package "${PACKAGE_NAME}")
    fi
    bash scripts/gs25-301-replay-mitm-run.sh "${run_args[@]}"

    raw_log="${run_dir}/mitmdump-replay-raw.log"
    summary_json="${run_dir}/summary.json"
    if [[ -f "${raw_log}" ]]; then
      node scripts/gs25-301-replay-result-summary.mjs "${raw_log}" > "${summary_json}" || true
    fi

    node - <<'JS' "${MANIFEST}" "${run_dir}" "${tuple_file}" "${tuple_idx}" "${mode}" "${summary_json}"
const fs = require('fs');
const [manifest, runDir, tupleFile, tupleIdx, mode, summaryPath] = process.argv.slice(2);
let summary = null;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch {
  summary = null;
}
const rec = {
  ts: Date.now(),
  runDir,
  tupleFile,
  tupleIdx: Number(tupleIdx),
  mode,
  summary,
};
fs.appendFileSync(manifest, JSON.stringify(rec) + '\n');
JS
  done
done

echo "배치 완료: ${OUT_ROOT}"
echo "manifest: ${MANIFEST}"
