#!/usr/bin/env python3
"""
blackboxprotobuf 기반 payload 디코딩 시도 스크립트.

입력:
- export 디렉터리(manifest.json 포함)

출력:
- payload별 decode 성공/실패 및 상위 키 통계(JSON)
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from typing import Any
import base64

try:
    import blackboxprotobuf  # type: ignore
except Exception:
    print(
        json.dumps(
            {
                "ok": False,
                "error": "blackboxprotobuf_not_installed",
                "hint": "python3 -m pip install --user blackboxprotobuf",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    sys.exit(2)


def flatten_keys(obj: Any, prefix: str = "") -> list[str]:
    out: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else str(k)
            out.append(p)
            out.extend(flatten_keys(v, p))
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:8]):
            p = f"{prefix}[{i}]"
            out.append(p)
            out.extend(flatten_keys(v, p))
    return out


def sanitize_for_json(obj: Any) -> Any:
    if isinstance(obj, bytes):
        return {"__bytes_b64": base64.b64encode(obj).decode("ascii")}
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "사용법: python3 scripts/gs25-pgl-meta-blackboxprotobuf-check.py <payload-export-dir>",
            file=sys.stderr,
        )
        return 1

    payload_dir = sys.argv[1]
    manifest_path = os.path.join(payload_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        print(f"manifest.json 없음: {manifest_path}", file=sys.stderr)
        return 1

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    results: list[dict[str, Any]] = []
    key_counter: Counter[str] = Counter()
    ok_count = 0

    for row in manifest.get("exported", []):
        file_path = row.get("file")
        if not file_path or not os.path.exists(file_path):
            continue
        with open(file_path, "rb") as f:
            data = f.read()
        one: dict[str, Any] = {
            "code": row.get("code"),
            "file": file_path,
            "bytes": len(data),
            "count": row.get("count"),
        }
        try:
            decoded, typedef = blackboxprotobuf.decode_message(data)
            decoded_json = sanitize_for_json(decoded)
            one["ok"] = True
            one["top_keys"] = sorted(decoded.keys(), key=lambda x: int(x) if str(x).isdigit() else str(x))
            one["typedef_keys"] = sorted(
                typedef.keys(), key=lambda x: int(x) if str(x).isdigit() else str(x)
            )
            one["json_preview"] = json.dumps(decoded_json, ensure_ascii=False)[:500]
            ok_count += 1
            for k in flatten_keys(decoded_json):
                key_counter[k] += 1
        except Exception as exc:
            one["ok"] = False
            one["error"] = str(exc)
        results.append(one)

    out = {
        "ok": True,
        "source": manifest.get("source"),
        "payloadDir": payload_dir,
        "totalPayloads": len(results),
        "decodeSuccess": ok_count,
        "decodeFailure": len(results) - ok_count,
        "commonDecodedKeys": [{"key": k, "count": c} for k, c in key_counter.most_common(20)],
        "rows": results,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
