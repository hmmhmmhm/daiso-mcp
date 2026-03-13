# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.2.0,<2",
# ]
# ///

import argparse
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("ghidra-cli-mcp")

DEFAULT_RUNNER = str((Path(__file__).resolve().parent / "run-analyze-headless-x64.sh"))
DEFAULT_SCRIPT_DIR = str(Path(__file__).resolve().parent)

RUNNER = os.environ.get("GHIDRA_HEADLESS_RUNNER", DEFAULT_RUNNER)
PROJECT_BASE = os.environ.get("GHIDRA_HEADLESS_PROJECT_BASE", "/tmp/ghidra-cli-mcp")
TIMEOUT_SECONDS = int(os.environ.get("GHIDRA_HEADLESS_TIMEOUT", "240"))


def _run_headless(action: str, binary_path: str, arg1: str = "") -> dict:
    binary = Path(binary_path).expanduser().resolve()
    if not binary.exists() or not binary.is_file():
        return {
            "ok": False,
            "error": f"binary not found: {binary}",
        }

    os.makedirs(PROJECT_BASE, exist_ok=True)
    project_name = f"proj_{uuid.uuid4().hex[:10]}"

    with tempfile.NamedTemporaryFile(prefix="ghidra-headless-", suffix=".json", delete=False) as tf:
        output_json = tf.name

    cmd = [
        RUNNER,
        PROJECT_BASE,
        project_name,
        "-import",
        str(binary),
        "-scriptPath",
        DEFAULT_SCRIPT_DIR,
        "-postScript",
        "headless_export.py",
        action,
        output_json,
    ]

    if arg1:
        cmd.append(arg1)

    cmd.extend([
        "-deleteProject",
    ])

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
    except Exception as e:
        return {
            "ok": False,
            "error": f"headless execution failed: {e}",
        }

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": "analyzeHeadless failed",
            "returncode": proc.returncode,
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-4000:],
        }

    try:
        with open(output_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        return {
            "ok": False,
            "error": f"failed to read output json: {e}",
        }
    finally:
        try:
            os.remove(output_json)
        except OSError:
            pass


@mcp.tool()
def list_functions(binary_path: str, limit: int = 200) -> str:
    """
    바이너리에서 함수 목록을 headless 방식으로 조회합니다.
    """
    data = _run_headless("list_functions", binary_path, str(limit))
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool()
def list_strings(binary_path: str, limit: int = 200) -> str:
    """
    바이너리에서 문자열 목록을 headless 방식으로 조회합니다.
    """
    data = _run_headless("list_strings", binary_path, str(limit))
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool()
def decompile_function(binary_path: str, function_name: str) -> str:
    """
    지정한 함수명을 headless 방식으로 디컴파일합니다.
    """
    data = _run_headless("decompile_function", binary_path, function_name)
    return json.dumps(data, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CLI-only MCP server for Ghidra headless")
    parser.add_argument("--transport", choices=["stdio", "sse"], default="stdio")
    parser.add_argument("--mcp-host", type=str, default="127.0.0.1")
    parser.add_argument("--mcp-port", type=int, default=8091)
    args = parser.parse_args()

    if args.transport == "sse":
        mcp.settings.host = args.mcp_host
        mcp.settings.port = args.mcp_port
        mcp.run(transport="sse")
    else:
        mcp.run()
