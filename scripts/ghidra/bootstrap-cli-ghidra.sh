#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="${GHIDRA_HEADLESS_RUNNER:-$ROOT_DIR/scripts/ghidra/run-analyze-headless-x64.sh}"
CHECKER="$ROOT_DIR/scripts/ghidra/check-cli-ghidra-mcp.sh"

JAVA_HOME_X64="${JAVA_HOME_X64:-$HOME/.system-tools/jdks/jdk-21.0.10+7/Contents/Home}"
GHIDRA_DIST_HOME="${GHIDRA_DIST_HOME:-$HOME/.system-tools/ghidra-dist/ghidra_11.3.2_PUBLIC}"

fail() {
  echo "[ERROR] $1" >&2
  exit 1
}

info() {
  echo "[INFO] $1"
}

info "CLI Ghidra 환경 점검 시작"

command -v arch >/dev/null 2>&1 || fail "arch 명령을 찾을 수 없습니다"
command -v python3 >/dev/null 2>&1 || fail "python3 명령을 찾을 수 없습니다"
command -v clang >/dev/null 2>&1 || fail "clang 명령을 찾을 수 없습니다"

if ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
  fail "Rosetta(x86_64 실행) 환경이 준비되지 않았습니다"
fi

[ -x "$JAVA_HOME_X64/bin/java" ] || fail "x64 Java가 없습니다: $JAVA_HOME_X64/bin/java"
[ -x "$GHIDRA_DIST_HOME/support/analyzeHeadless" ] || fail "Ghidra analyzeHeadless가 없습니다: $GHIDRA_DIST_HOME/support/analyzeHeadless"
[ -x "$RUNNER" ] || fail "headless runner가 없습니다: $RUNNER"
[ -x "$CHECKER" ] || fail "점검 스크립트가 없습니다: $CHECKER"

export JAVA_HOME_X64
export GHIDRA_DIST_HOME
export GHIDRA_HEADLESS_RUNNER="$RUNNER"

info "headless 스모크 테스트 실행"
"$CHECKER"

info "별도 Codex 프로세스 MCP 호출 테스트 실행"
CODEX_OUT=$(codex exec --dangerously-bypass-approvals-and-sandbox \
  --cd "$ROOT_DIR" \
  --skip-git-repo-check \
  "Use the ghidra MCP tool list_functions with binary_path=/tmp/ghidra_mcp_test and limit=3. Return only JSON with ok and action." 2>&1 || true)

echo "$CODEX_OUT" | rg '"ok"\s*:\s*true' >/dev/null 2>&1 || fail "별도 Codex MCP 호출 실패"

echo "$CODEX_OUT" | rg 'tool ghidra\.list_functions' >/dev/null 2>&1 || fail "ghidra MCP 호출 로그를 찾지 못했습니다"

info "모든 점검 통과"
