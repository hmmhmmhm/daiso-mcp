#!/bin/zsh
set -euo pipefail

BIN_PATH="${1:-/tmp/ghidra_mcp_test}"

if [ ! -f "$BIN_PATH" ]; then
  echo "[INFO] 테스트 바이너리 생성: $BIN_PATH"
  cat > /tmp/ghidra_mcp_test.c <<'C'
#include <stdio.h>
int add(int a, int b) { return a + b; }
int main(void) { printf("%d\\n", add(2, 3)); return 0; }
C
  clang /tmp/ghidra_mcp_test.c -o /tmp/ghidra_mcp_test
  BIN_PATH="/tmp/ghidra_mcp_test"
fi

echo "[INFO] binary: $BIN_PATH"

echo "[STEP] list_functions"
python3 /Users/hm/Documents/GitHub/daiso-mcp/scripts/ghidra/cli_mcp_ghidra.py --help >/dev/null
python3 - <<'PY'
import json
import importlib.util
from pathlib import Path

p = Path('/Users/hm/Documents/GitHub/daiso-mcp/scripts/ghidra/cli_mcp_ghidra.py')
spec = importlib.util.spec_from_file_location('cli_mcp_ghidra', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

bin_path = '/tmp/ghidra_mcp_test'
res = m._run_headless('list_functions', bin_path, '20')
print(json.dumps(res, ensure_ascii=False, indent=2)[:1200])
if not res.get('ok'):
    raise SystemExit(1)
fn = None
for f in res.get('functions', []):
    if f.get('name') == '_add':
        fn = '_add'
        break
if not fn and res.get('functions'):
    fn = res['functions'][0]['name']
if not fn:
    raise SystemExit(1)
res2 = m._run_headless('decompile_function', bin_path, fn)
print(json.dumps(res2, ensure_ascii=False, indent=2)[:1200])
if not res2.get('ok'):
    raise SystemExit(1)
PY

echo "[PASS] CLI Ghidra MCP 점검 완료"
