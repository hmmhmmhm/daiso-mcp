#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="/Users/hm/Documents/GitHub/daiso-mcp"
BRIDGE_PY="$HOME/.system-tools/ghidra-mcp/bridge_mcp_ghidra.py"
RUNNER="$PROJECT_ROOT/scripts/ghidra/run-ghidra-x64.sh"
GHIDRA_URL="http://127.0.0.1:8080/list_functions"
START_GHIDRA="${1:-}"

pass() { echo "[PASS] $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "== Ghidra MCP 점검 시작 =="

if [ -f "$PROJECT_ROOT/.mcp.json" ]; then
  if rg -n "$BRIDGE_PY" "$PROJECT_ROOT/.mcp.json" >/dev/null 2>&1; then
    pass ".mcp.json ghidra bridge 경로 확인"
  else
    fail ".mcp.json에 시스템 bridge 경로가 설정되지 않음"
    exit 1
  fi
else
  fail ".mcp.json 파일이 없음"
  exit 1
fi

if [ -f "$BRIDGE_PY" ]; then
  pass "bridge_mcp_ghidra.py 존재"
else
  fail "bridge_mcp_ghidra.py 없음: $BRIDGE_PY"
  exit 1
fi

if python3 "$BRIDGE_PY" --help >/dev/null 2>&1; then
  pass "Python bridge 실행 가능"
else
  fail "Python bridge 실행 실패"
  exit 1
fi

if arch -x86_64 "$HOME/.system-tools/jdks/jdk-21.0.10+7/Contents/Home/bin/java" -version >/dev/null 2>&1; then
  pass "x64 Java(Rosetta) 실행 가능"
else
  fail "x64 Java(Rosetta) 실행 실패"
  exit 1
fi

if [ "$START_GHIDRA" = "--start" ]; then
  warn "Ghidra 실행 시도 (--start)"
  nohup "$RUNNER" >/tmp/ghidra-runner.out 2>/tmp/ghidra-runner.err &
  sleep 3
fi

if curl -sS --max-time 2 "$GHIDRA_URL" >/tmp/ghidra-bridge-health.txt; then
  pass "Ghidra HTTP bridge 응답 확인 (8080)"
  echo "== 점검 완료: OK =="
  exit 0
fi

warn "8080 응답 없음: $GHIDRA_URL"
warn "GUI 세션에서 Ghidra 실행 후 플러그인 활성화 필요"
warn "실행 명령: $RUNNER"
echo "== 점검 완료: 부분 실패 =="
exit 2
