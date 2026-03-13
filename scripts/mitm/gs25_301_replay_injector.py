"""
GS25 code=301 replay 튜플 주입 mitmproxy 애드온.

기능:
- 캡처에서 추출한 replay tuple(wrapper/field4/token)을 요청 body에 주입
- f5(epoch sec)만 현재시각으로 갱신하는 모드 지원

사용 예:
  mitmdump -s scripts/mitm/gs25_301_replay_injector.py \
    --set gs25_replay_enable=true \
    --set gs25_replay_tuple_file=captures/gs25-pgl-meta-301-replay-tuples-r12.json \
    --set gs25_replay_mode=replace_wrapper_f5_now \
    --set gs25_replay_hosts=api16-access-sg.pangle.io
"""

from __future__ import annotations

import base64
import json
import os
import time
from typing import Any

from mitmproxy import ctx, http


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


def encode_varint(value: int) -> bytes:
    v = int(value)
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return bytes(out)


def encode_key(field_no: int, wire_type: int) -> bytes:
    return encode_varint((field_no << 3) | wire_type)


def parse_top_level(buf: bytes) -> dict[int, tuple[int, Any]]:
    """
    protobuf top-level을 단순 파싱합니다.
    반환: field_no -> (wire_type, value)
    """
    i = 0
    out: dict[int, tuple[int, Any]] = {}
    while i < len(buf):
        ok, key, i2 = read_varint(buf, i)
        if not ok or key <= 0:
            break
        i = i2
        wt = key & 7
        fn = key >> 3
        if fn <= 0:
            break
        if wt == 0:
            ok, v, i = read_varint(buf, i)
            if not ok:
                break
            out[fn] = (wt, v)
            continue
        if wt == 2:
            ok, ln, i = read_varint(buf, i)
            if not ok or ln < 0 or i + ln > len(buf):
                break
            out[fn] = (wt, buf[i : i + ln])
            i += ln
            continue
        # 본 플러그인은 0/2 wire type만 대상으로 함
        break
    return out


def build_wrapper(f1: int, f2: int, f3: int, field4: bytes, f5: int) -> bytes:
    """
    관측된 301 wrapper 스키마(1,2,3,4,5)에 맞춰 재직렬화합니다.
    """
    out = bytearray()
    out += encode_key(1, 0) + encode_varint(f1)
    out += encode_key(2, 0) + encode_varint(f2)
    out += encode_key(3, 0) + encode_varint(f3)
    out += encode_key(4, 2) + encode_varint(len(field4)) + field4
    out += encode_key(5, 0) + encode_varint(f5)
    return bytes(out)


def decode_b64(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"))


class GS25301ReplayInjector:
    def __init__(self) -> None:
        self._tuple_cache: dict[str, Any] | None = None
        self._tuple_cache_path: str = ""
        self._tuple_cache_mtime: float = 0.0

    def load(self, loader):
        loader.add_option(
            "gs25_replay_enable",
            bool,
            False,
            "301 replay 주입 활성화",
        )
        loader.add_option(
            "gs25_replay_hosts",
            str,
            "api16-access-sg.pangle.io,api16-access-wf-sg.pangle.io,api-access.pangolin-sdk-toutiao.com",
            "주입 대상 호스트(콤마 구분)",
        )
        loader.add_option(
            "gs25_replay_path_contains",
            str,
            "/api/ad/union/sdk/get_ads/",
            "요청 URL 포함 조건(콤마 구분)",
        )
        loader.add_option(
            "gs25_replay_tuple_file",
            str,
            "",
            "replay tuple JSON 파일 경로",
        )
        loader.add_option(
            "gs25_replay_tuple_index",
            int,
            0,
            "사용할 tuple 인덱스",
        )
        loader.add_option(
            "gs25_replay_mode",
            str,
            "replace_wrapper_f5_now",
            "주입 모드: replace_wrapper | replace_wrapper_f5_now | replace_field4_keep_current",
        )
        loader.add_option(
            "gs25_replay_response_body_max",
            int,
            120,
            "응답 본문 로그 최대 길이(텍스트)",
        )

    def _host_ok(self, host: str) -> bool:
        hosts = [x.strip() for x in ctx.options.gs25_replay_hosts.split(",") if x.strip()]
        return not hosts or host in hosts

    def _path_ok(self, url: str) -> bool:
        pats = [x.strip() for x in ctx.options.gs25_replay_path_contains.split(",") if x.strip()]
        if not pats:
            return True
        return any(p in url for p in pats)

    def _load_tuple_json(self) -> dict[str, Any] | None:
        path_opt = str(ctx.options.gs25_replay_tuple_file or "").strip()
        if not path_opt:
            return None
        if not os.path.exists(path_opt):
            ctx.log.warn(f"[GS25_REPLAY] tuple file not found: {path_opt}")
            return None
        mtime = os.path.getmtime(path_opt)
        if (
            self._tuple_cache is not None
            and self._tuple_cache_path == path_opt
            and self._tuple_cache_mtime == mtime
        ):
            return self._tuple_cache
        with open(path_opt, "r", encoding="utf-8") as f:
            obj = json.load(f)
        self._tuple_cache = obj
        self._tuple_cache_path = path_opt
        self._tuple_cache_mtime = mtime
        return obj

    def _pick_tuple(self, obj: dict[str, Any]) -> dict[str, Any] | None:
        tuples = obj.get("tuples")
        if not isinstance(tuples, list) or not tuples:
            return None
        idx = int(ctx.options.gs25_replay_tuple_index)
        if idx < 0:
            idx = 0
        if idx >= len(tuples):
            idx = len(tuples) - 1
        item = tuples[idx]
        return item if isinstance(item, dict) else None

    def _replace_wrapper(self, tup: dict[str, Any]) -> bytes | None:
        rt = tup.get("replayTuple") or {}
        w = rt.get("wrapperB64")
        if not isinstance(w, str) or not w:
            return None
        return decode_b64(w)

    def _replace_wrapper_f5_now(self, tup: dict[str, Any]) -> bytes | None:
        rt = tup.get("replayTuple") or {}
        field4_b64 = rt.get("field4B64")
        if not isinstance(field4_b64, str) or not field4_b64:
            return None
        meta = tup.get("wrapperMeta") or {}
        try:
            f1 = int(meta.get("f1"))
            f2 = int(meta.get("f2"))
            f3 = int(meta.get("f3"))
        except Exception:
            return None
        f4 = decode_b64(field4_b64)
        f5 = int(time.time())
        return build_wrapper(f1, f2, f3, f4, f5)

    def _replace_field4_keep_current(self, current_body: bytes, tup: dict[str, Any]) -> bytes | None:
        cur = parse_top_level(current_body)
        need = [1, 2, 3, 4, 5]
        if not all(k in cur for k in need):
            return None
        if not all(cur[k][0] in (0, 2) for k in need):
            return None
        rt = tup.get("replayTuple") or {}
        field4_b64 = rt.get("field4B64")
        if not isinstance(field4_b64, str) or not field4_b64:
            return None
        f4 = decode_b64(field4_b64)
        f1 = int(cur[1][1])
        f2 = int(cur[2][1])
        f3 = int(cur[3][1])
        f5 = int(cur[5][1])
        return build_wrapper(f1, f2, f3, f4, f5)

    def request(self, flow: http.HTTPFlow):
        if not bool(ctx.options.gs25_replay_enable):
            return

        host = flow.request.pretty_host
        if not self._host_ok(host):
            return
        if not self._path_ok(flow.request.pretty_url):
            return

        obj = self._load_tuple_json()
        if obj is None:
            return
        tup = self._pick_tuple(obj)
        if tup is None:
            ctx.log.warn("[GS25_REPLAY] tuple 선택 실패")
            return

        mode = str(ctx.options.gs25_replay_mode or "").strip()
        current = flow.request.raw_content or b""
        replaced: bytes | None = None
        if mode == "replace_wrapper":
            replaced = self._replace_wrapper(tup)
        elif mode == "replace_field4_keep_current":
            replaced = self._replace_field4_keep_current(current, tup)
        else:
            replaced = self._replace_wrapper_f5_now(tup)
            mode = "replace_wrapper_f5_now"

        if not replaced:
            ctx.log.warn(f"[GS25_REPLAY] 주입 실패 mode={mode}")
            return

        before_len = len(current)
        flow.request.raw_content = replaced
        flow.request.headers["content-length"] = str(len(replaced))

        token = (tup.get("replayTuple") or {}).get("token", "")
        flow.metadata["gs25_replay_applied"] = True
        flow.metadata["gs25_replay_mode"] = mode
        flow.metadata["gs25_replay_token"] = token
        flow.metadata["gs25_replay_before_len"] = before_len
        flow.metadata["gs25_replay_after_len"] = len(replaced)
        ctx.log.info(
            json.dumps(
                {
                    "tag": "GS25_REPLAY_APPLIED",
                    "mode": mode,
                    "method": flow.request.method,
                    "url": flow.request.pretty_url,
                    "host": host,
                    "before_len": before_len,
                    "after_len": len(replaced),
                    "token": token,
                },
                ensure_ascii=False,
            )
        )

    def response(self, flow: http.HTTPFlow):
        if not flow.metadata.get("gs25_replay_applied"):
            return
        body = flow.response.raw_content or b""
        max_len = int(ctx.options.gs25_replay_response_body_max)
        preview = ""
        try:
            preview = body.decode("utf-8", errors="ignore")
            if len(preview) > max_len:
                preview = preview[:max_len] + "...(truncated)"
        except Exception:
            preview = ""
        ctx.log.info(
            json.dumps(
                {
                    "tag": "GS25_REPLAY_RESULT",
                    "mode": flow.metadata.get("gs25_replay_mode"),
                    "method": flow.request.method,
                    "url": flow.request.pretty_url,
                    "host": flow.request.pretty_host,
                    "status": flow.response.status_code,
                    "token": flow.metadata.get("gs25_replay_token", ""),
                    "before_len": flow.metadata.get("gs25_replay_before_len"),
                    "after_len": flow.metadata.get("gs25_replay_after_len"),
                    "response_content_type": flow.response.headers.get("content-type", ""),
                    "response_preview": preview,
                },
                ensure_ascii=False,
            )
        )


addons = [GS25301ReplayInjector()]
