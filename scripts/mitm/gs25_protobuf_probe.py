"""
GS25 트래픽에서 protobuf 가능 payload를 탐지/요약하는 mitmproxy 애드온.

사용 예:
  mitmdump -s scripts/mitm/gs25_protobuf_probe.py --set gs25_proto_hosts=api16-access-sg.pangle.io
"""

from __future__ import annotations

import base64
import json
from typing import Any

from mitmproxy import ctx, http

try:
    import blackboxprotobuf  # type: ignore
except Exception:
    blackboxprotobuf = None


def read_varint(buf: bytes, offset: int) -> tuple[bool, int, int]:
    value = 0
    shift = 0
    i = offset
    while i < len(buf) and i < offset + 10:
        b = buf[i]
        value |= (b & 0x7F) << shift
        i += 1
        if (b & 0x80) == 0:
            return True, value, i
        shift += 7
    return False, 0, i


def protobuf_likelihood(buf: bytes) -> dict[str, Any]:
    off = 0
    fields = 0
    examples: list[dict[str, int]] = []
    while off < len(buf) and fields < 128:
        ok, key, off2 = read_varint(buf, off)
        if not ok or key <= 0:
            break
        wt = key & 7
        fn = key >> 3
        if fn <= 0:
            break
        off = off2
        fields += 1
        if len(examples) < 8:
            examples.append({"fieldNo": fn, "wireType": wt})
        if wt == 0:
            ok, _, off = read_varint(buf, off)
            if not ok:
                break
            continue
        if wt == 1:
            if off + 8 > len(buf):
                break
            off += 8
            continue
        if wt == 2:
            ok, ln, off3 = read_varint(buf, off)
            if not ok:
                break
            off = off3
            if ln < 0 or off + ln > len(buf):
                break
            off += ln
            continue
        if wt == 5:
            if off + 4 > len(buf):
                break
            off += 4
            continue
        break
    ratio = (off / len(buf)) if buf else 0.0
    likely = fields >= 2 and off == len(buf) and ratio >= 0.85
    return {"likely": likely, "fields": fields, "consumed": off, "total": len(buf), "examples": examples}


def sanitize(obj: Any) -> Any:
    if isinstance(obj, bytes):
        return {"__bytes_b64": base64.b64encode(obj).decode("ascii")}
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj


class GS25ProtoProbe:
    def load(self, loader):
        loader.add_option(
            "gs25_proto_hosts",
            str,
            "api16-access-sg.pangle.io,api-access.pangolin-sdk-toutiao.com",
            "protobuf 탐지 대상 호스트(콤마 구분)",
        )
        loader.add_option(
            "gs25_proto_min_len",
            int,
            16,
            "protobuf 탐지 최소 body 길이",
        )

    def response(self, flow: http.HTTPFlow):
        host_filters = [h.strip() for h in ctx.options.gs25_proto_hosts.split(",") if h.strip()]
        host = flow.request.pretty_host
        if host_filters and host not in host_filters:
            return
        body = flow.response.raw_content or b""
        if len(body) < int(ctx.options.gs25_proto_min_len):
            return
        score = protobuf_likelihood(body)
        if not score["likely"]:
            return

        log_obj: dict[str, Any] = {
            "tag": "GS25_PROTOBUF_CANDIDATE",
            "method": flow.request.method,
            "url": flow.request.pretty_url,
            "status": flow.response.status_code,
            "content_type": flow.response.headers.get("content-type", ""),
            "protobuf": score,
        }

        if blackboxprotobuf is not None:
            try:
                decoded, typedef = blackboxprotobuf.decode_message(body)
                log_obj["blackbox"] = {
                    "ok": True,
                    "keys": sorted(list(decoded.keys()), key=str),
                    "typedef_keys": sorted(list(typedef.keys()), key=str),
                    "preview": json.dumps(sanitize(decoded), ensure_ascii=False)[:500],
                }
            except Exception as exc:
                log_obj["blackbox"] = {"ok": False, "error": str(exc)}
        else:
            log_obj["blackbox"] = {"ok": False, "error": "blackboxprotobuf_not_installed"}

        ctx.log.info(json.dumps(log_obj, ensure_ascii=False))


addons = [GS25ProtoProbe()]
