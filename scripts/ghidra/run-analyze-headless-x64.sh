#!/bin/zsh
set -euo pipefail

# SIP 비활성 + arm64 JVM SIGBUS 우회: x64 Java(Rosetta) 강제
JAVA_HOME_X64="${JAVA_HOME_X64:-$HOME/.system-tools/jdks/jdk-21.0.10+7/Contents/Home}"
GHIDRA_DIST_HOME="${GHIDRA_DIST_HOME:-$HOME/.system-tools/ghidra-dist/ghidra_11.3.2_PUBLIC}"
ANALYZE="$GHIDRA_DIST_HOME/support/analyzeHeadless"

if [ ! -x "$JAVA_HOME_X64/bin/java" ]; then
  echo "[ERROR] java not found: $JAVA_HOME_X64/bin/java" >&2
  exit 1
fi
if [ ! -x "$ANALYZE" ]; then
  echo "[ERROR] analyzeHeadless not found: $ANALYZE" >&2
  exit 1
fi

# launch.sh가 TTY 없이 JDK 경로 질문하지 않도록 저장
SETTINGS_DIR="$HOME/Library/ghidra/ghidra_11.3.2_PUBLIC"
mkdir -p "$SETTINGS_DIR"
printf '%s\n' "$JAVA_HOME_X64" > "$SETTINGS_DIR/java_home.save"

export JAVA_HOME="$JAVA_HOME_X64"
export PATH="$JAVA_HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin"

exec arch -x86_64 "$ANALYZE" "$@"
