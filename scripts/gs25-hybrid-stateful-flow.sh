#!/usr/bin/env bash
set -euo pipefail

# GS25 상태분기형 하이브리드 플로우
# - idle -> uiauto -> keyword 순서를 기본으로 실행
# - 각 단계 사이에 모달 정리/앱 재실행을 삽입해 타깃 트리거 확률을 높임

DEVICE_SERIAL="${DEVICE_SERIAL:-}"
PACKAGE="${PACKAGE:-com.gsr.gs25}"
IDLE_SEC="${IDLE_SEC:-15}"
CYCLE_COUNT="${CYCLE_COUNT:-1}"
STEP_PAUSE="${STEP_PAUSE:-3}"
GUARD_PASSES="${GUARD_PASSES:-2}"

# keyword 흐름 입력
SEARCH_KEYWORD="${SEARCH_KEYWORD:-8801117752804}"
MODAL_ACTION="${MODAL_ACTION:-cancel}"

adb_cmd() {
  if [[ -n "${DEVICE_SERIAL}" ]]; then
    adb -s "${DEVICE_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

launch_app() {
  adb_cmd shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
}

modal_sweep() {
  # 백키는 앱 문맥을 이탈시킬 수 있어 사용하지 않는다.
  adb_cmd shell input tap 271 1258 >/dev/null 2>&1 || true
  adb_cmd shell input tap 778 1571 >/dev/null 2>&1 || true
}

run_idle_phase() {
  echo "[stateful] idle phase (${IDLE_SEC}s)"
  DEVICE_SERIAL="${DEVICE_SERIAL}" IDLE_SEC="${IDLE_SEC}" scripts/gs25-idle-flow.sh || true
}

run_guard_phase() {
  echo "[stateful] guard phase"
  DEVICE_SERIAL="${DEVICE_SERIAL}" \
  PASS_COUNT="${GUARD_PASSES}" \
  scripts/gs25-ui-guard-flow.sh || true
}

run_uiauto_phase() {
  echo "[stateful] uiauto phase"
  DEVICE_SERIAL="${DEVICE_SERIAL}" \
  PREEMPTIVE_MODAL_CLEAR=1 \
  FOCUS_RETRY=10 \
  DUMP_RETRY=8 \
  scripts/gs25-stock-flow-uiautomator.sh || true
}

run_keyword_phase() {
  echo "[stateful] keyword phase"
  DEVICE_SERIAL="${DEVICE_SERIAL}" \
  SEARCH_KEYWORD="${SEARCH_KEYWORD}" \
  MODAL_ACTION="${MODAL_ACTION}" \
  scripts/gs25-stock-flow-keyword-adb.sh || true
}

sanitize_inputs() {
  if ! [[ "${CYCLE_COUNT}" =~ ^[0-9]+$ ]]; then
    CYCLE_COUNT="2"
  fi
  if (( CYCLE_COUNT < 1 )); then
    CYCLE_COUNT=1
  fi
  if (( CYCLE_COUNT > 4 )); then
    CYCLE_COUNT=4
  fi
}

sanitize_inputs

echo "[stateful] start cycles=${CYCLE_COUNT} keyword=${SEARCH_KEYWORD}"

for ((i=1; i<=CYCLE_COUNT; i+=1)); do
  echo "[stateful] cycle ${i}/${CYCLE_COUNT} launch"
  launch_app
  sleep "${STEP_PAUSE}"
  modal_sweep
  sleep 1

  # 매 사이클마다 idle + uiauto + keyword를 모두 수행
  run_idle_phase
  sleep "${STEP_PAUSE}"

  modal_sweep
  sleep 1
  run_guard_phase
  sleep "${STEP_PAUSE}"

  modal_sweep
  sleep 1
  run_uiauto_phase
  sleep "${STEP_PAUSE}"

  modal_sweep
  sleep 1
  run_guard_phase
  sleep "${STEP_PAUSE}"

  modal_sweep
  sleep 1
  run_keyword_phase
  sleep "${STEP_PAUSE}"
done

echo "[stateful] done"
