#!/bin/zsh
set -euo pipefail

# SIP 비활성 환경에서 arm64 JVM SIGBUS를 우회하기 위해 x64 JVM(Rosetta)로 실행
JAVA_HOME_X64="$HOME/.system-tools/jdks/jdk-21.0.10+7/Contents/Home"
GHIDRA_RUN="$HOME/.system-tools/ghidra-dist/ghidra_11.3.2_PUBLIC/ghidraRun"

if [ ! -x "$JAVA_HOME_X64/bin/java" ]; then
  echo "[ERROR] x64 Java not found: $JAVA_HOME_X64/bin/java" >&2
  echo "설치 필요: ~/.system-tools/jdks/jdk-21.0.10+7" >&2
  exit 1
fi

if [ ! -x "$GHIDRA_RUN" ]; then
  echo "[ERROR] ghidraRun not found: $GHIDRA_RUN" >&2
  echo "설치 필요: ~/.system-tools/ghidra-dist/ghidra_11.3.2_PUBLIC" >&2
  exit 1
fi

export JAVA_HOME="$JAVA_HOME_X64"
export PATH="$JAVA_HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin"

exec arch -x86_64 "$GHIDRA_RUN" "$@"
