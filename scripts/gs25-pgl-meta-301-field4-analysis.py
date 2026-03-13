#!/usr/bin/env python3
"""
code=301 protobuf wrapper의 field #4(bytes) 내부 포맷을 분석합니다.

입력:
- payload .bin 파일 (wrapper 전체 바이너리)
"""

from __future__ import annotations

import base64
import json
import math
import sys
from collections import Counter
from typing import Any

import blackboxprotobuf  # type: ignore


def entropy(data: bytes) -> float:
    if not data:
        return 0.0
    c = Counter(data)
    n = len(data)
    return -sum((v / n) * math.log2(v / n) for v in c.values())


def read_varint(buf: bytes, off: int) -> tuple[bool, int, int]:
    value = 0
    shift = 0
    i = off
    while i < len(buf) and i < off + 10:
        b = buf[i]
        value |= (b & 0x7F) << shift
        i += 1
        if (b & 0x80) == 0:
            return True, value, i
        shift += 7
    return False, 0, i


def wire_scan(buf: bytes, max_fields: int = 256) -> dict[str, Any]:
    off = 0
    fields = 0
    examples: list[dict[str, int]] = []
    while off < len(buf) and fields < max_fields:
        ok, key, off2 = read_varint(buf, off)
        if not ok or key <= 0:
            break
        wire = key & 7
        field_no = key >> 3
        if field_no <= 0:
            break
        off = off2
        fields += 1
        if len(examples) < 12:
            examples.append({"fieldNo": field_no, "wireType": wire})
        if wire == 0:
            ok, _, off = read_varint(buf, off)
            if not ok:
                break
            continue
        if wire == 1:
            if off + 8 > len(buf):
                break
            off += 8
            continue
        if wire == 2:
            ok, ln, off3 = read_varint(buf, off)
            if not ok:
                break
            off = off3
            if ln < 0 or off + ln > len(buf):
                break
            off += ln
            continue
        if wire == 5:
            if off + 4 > len(buf):
                break
            off += 4
            continue
        break
    ratio = (off / len(buf)) if buf else 0.0
    return {
        "fields": fields,
        "consumed": off,
        "total": len(buf),
        "ratio": round(ratio, 6),
        "fullConsumed": off == len(buf),
        "examples": examples,
    }


def sanitize(v: Any) -> Any:
    if isinstance(v, bytes):
        return {"__bytes_b64": base64.b64encode(v).decode("ascii"), "__bytes_len": len(v)}
    if isinstance(v, dict):
        return {str(k): sanitize(x) for k, x in v.items()}
    if isinstance(v, list):
        return [sanitize(x) for x in v]
    return v


def magic_flags(data: bytes) -> list[str]:
    flags: list[str] = []
    if data.startswith(b"\x1f\x8b"):
        flags.append("gzip")
    if data.startswith(b"\x78\x9c") or data.startswith(b"\x78\xda"):
        flags.append("zlib")
    if data.startswith(b"PK\x03\x04"):
        flags.append("zip")
    if data.startswith(b"\x28\xb5\x2f\xfd"):
        flags.append("zstd")
    if data.startswith(b"\x04\x22\x4d\x18"):
        flags.append("lz4")
    return flags


def try_blackbox(data: bytes) -> dict[str, Any]:
    try:
        decoded, typedef = blackboxprotobuf.decode_message(data)
        return {
            "ok": True,
            "keys": sorted([str(k) for k in decoded.keys()]),
            "typedefKeys": sorted([str(k) for k in typedef.keys()]),
            "preview": json.dumps(sanitize(decoded), ensure_ascii=False)[:600],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def main() -> int:
    if len(sys.argv) < 2:
        print("사용법: python3 scripts/gs25-pgl-meta-301-field4-analysis.py <payload.bin>", file=sys.stderr)
        return 1
    fp = sys.argv[1]
    with open(fp, "rb") as f:
        blob = f.read()

    outer = try_blackbox(blob)
    out: dict[str, Any] = {
        "input": fp,
        "bytes": len(blob),
        "outerWire": wire_scan(blob),
        "outerBlackbox": outer,
    }

    field4: bytes | None = None
    if outer.get("ok"):
        decoded, _ = blackboxprotobuf.decode_message(blob)
        v = decoded.get("4")
        if isinstance(v, bytes):
            field4 = v

    if field4 is None:
        out["field4"] = {"ok": False, "error": "outer field#4 bytes not found"}
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    variants = {
        "raw": field4,
        "skip1": field4[1:] if len(field4) > 1 else b"",
        "skip2": field4[2:] if len(field4) > 2 else b"",
    }

    out["field4"] = {
        "ok": True,
        "length": len(field4),
        "entropy": round(entropy(field4), 6),
        "magic": magic_flags(field4),
        "b64Head": base64.b64encode(field4[:48]).decode("ascii"),
        "variants": {},
    }

    for name, data in variants.items():
        out["field4"]["variants"][name] = {
            "length": len(data),
            "entropy": round(entropy(data), 6),
            "magic": magic_flags(data),
            "wire": wire_scan(data),
            "blackbox": try_blackbox(data),
        }

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
