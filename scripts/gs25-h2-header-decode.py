#!/usr/bin/env python3
"""
GS25 네이티브 이벤트에서 HTTP/2 헤더를 복원하는 보조 스크립트.

입력:
- gs25-b2c-native-events.jsonl

출력(JSON):
- HTTP/1 요청 라인 집계
- HTTP/2 HEADERS/CONTINUATION 복원 결과(가능한 경우)
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


try:
    from hpack import Decoder as HpackDecoder
except Exception:
    HpackDecoder = None


HEX_TOKEN_RE = re.compile(r"\b[0-9a-fA-F]{2}\b")
HTTP1_REQ_RE = re.compile(
    rb"\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s]+)\s+HTTP/[0-9.]+",
    re.IGNORECASE,
)

H2_PREFACE = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"

FRAME_DATA = 0x0
FRAME_HEADERS = 0x1
FRAME_CONTINUATION = 0x9
FLAG_END_HEADERS = 0x4
FLAG_PADDED = 0x8
FLAG_PRIORITY = 0x20


def extract_bytes_from_hex_dump(hex_text: str) -> bytes:
    if not isinstance(hex_text, str) or not hex_text:
        return b""
    compact = re.sub(r"[^0-9a-fA-F]", "", hex_text)
    if len(compact) >= 2 and len(compact) % 2 == 0:
        try:
            return bytes.fromhex(compact)
        except Exception:
            pass
    tokens: List[str] = []
    for raw_line in hex_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = re.match(r"^[0-9a-fA-F]{8}\s+((?:[0-9a-fA-F]{2}\s+)+)", line)
        src = m.group(1) if m else re.sub(r"^[0-9a-fA-F]{8}\s+", "", line)
        tokens.extend(HEX_TOKEN_RE.findall(src))
    if not tokens:
        return b""
    return bytes(int(t, 16) for t in tokens)


def parse_http1_request_lines(blob: bytes) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for m in HTTP1_REQ_RE.finditer(blob):
        method = m.group(1).decode("ascii", errors="ignore").upper()
        path = m.group(2).decode("utf-8", errors="ignore")
        out.append((method, path))
    return out


@dataclass
class H2ConnState:
    conn_id: str
    decoder: "HpackDecoder"
    buffer: bytearray = field(default_factory=bytearray)
    preface_seen: bool = False
    header_fragments: Dict[int, bytearray] = field(default_factory=lambda: defaultdict(bytearray))
    decoded_headers: List[dict] = field(default_factory=list)

    def feed(self, chunk: bytes) -> None:
        if not chunk:
            return
        self.buffer.extend(chunk)
        self._consume()

    def _consume(self) -> None:
        while True:
            if not self.preface_seen:
                idx = self.buffer.find(H2_PREFACE)
                if idx < 0:
                    if len(self.buffer) > len(H2_PREFACE):
                        del self.buffer[:-len(H2_PREFACE)]
                    return
                del self.buffer[: idx + len(H2_PREFACE)]
                self.preface_seen = True

            if len(self.buffer) < 9:
                return

            length = int.from_bytes(self.buffer[0:3], "big")
            frame_type = self.buffer[3]
            flags = self.buffer[4]
            stream_id = int.from_bytes(self.buffer[5:9], "big") & 0x7FFFFFFF

            if len(self.buffer) < 9 + length:
                return

            payload = bytes(self.buffer[9 : 9 + length])
            del self.buffer[: 9 + length]

            if frame_type == FRAME_HEADERS:
                frag = self._extract_headers_fragment(payload, flags, is_headers=True)
                if frag is None:
                    continue
                self.header_fragments[stream_id].extend(frag)
                if flags & FLAG_END_HEADERS:
                    self._flush_header_block(stream_id)
            elif frame_type == FRAME_CONTINUATION:
                frag = self._extract_headers_fragment(payload, flags, is_headers=False)
                if frag is None:
                    continue
                self.header_fragments[stream_id].extend(frag)
                if flags & FLAG_END_HEADERS:
                    self._flush_header_block(stream_id)

    def _extract_headers_fragment(
        self, payload: bytes, flags: int, is_headers: bool
    ) -> Optional[bytes]:
        idx = 0
        end = len(payload)

        if is_headers and (flags & FLAG_PADDED):
            if len(payload) < 1:
                return None
            pad_len = payload[0]
            idx += 1
            end -= pad_len

        if is_headers and (flags & FLAG_PRIORITY):
            if len(payload) < idx + 5:
                return None
            idx += 5

        if end < idx:
            return None
        return payload[idx:end]

    def _flush_header_block(self, stream_id: int) -> None:
        block = bytes(self.header_fragments.pop(stream_id, b""))
        if not block:
            return
        try:
            pairs = self.decoder.decode(block)
            headers = []
            for k, v in pairs:
                headers.append({"name": str(k), "value": str(v)})
            pseudo = {h["name"]: h["value"] for h in headers if h["name"].startswith(":")}
            self.decoded_headers.append(
                {
                    "streamId": stream_id,
                    "pseudo": pseudo,
                    "headers": headers,
                }
            )
        except Exception as e:
            self.decoded_headers.append(
                {
                    "streamId": stream_id,
                    "decodeError": str(e),
                    "rawBlockHexPrefix": block[:64].hex(),
                    "rawBlockLen": len(block),
                }
            )


def main() -> int:
    if len(sys.argv) < 2:
        print("사용법: python3 scripts/gs25-h2-header-decode.py <events.jsonl>", file=sys.stderr)
        return 1

    if HpackDecoder is None:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "python hpack 모듈이 필요합니다. `python3 -m pip install hpack`",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2

    path = Path(sys.argv[1]).resolve()
    if not path.exists():
        print(json.dumps({"ok": False, "error": f"파일 없음: {str(path)}"}, ensure_ascii=False, indent=2))
        return 3

    http1_counter: Counter[str] = Counter()
    h2_states: Dict[str, H2ConnState] = {}
    total_events = 0
    io_events = 0

    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total_events += 1
            try:
                e = json.loads(line)
            except Exception:
                continue

            t = str(e.get("t", ""))
            if not (t.startswith("ssl_write") or t.startswith("fd_write")):
                continue
            io_events += 1

            raw = extract_bytes_from_hex_dump(str(e.get("hex", "")))
            if not raw:
                continue

            for method, req_path in parse_http1_request_lines(raw):
                http1_counter[f"{method} {req_path}"] += 1

            conn_id = str(e.get("ssl") or f"fd:{e.get('fd')}")
            st = h2_states.get(conn_id)
            if st is None:
                st = H2ConnState(conn_id=conn_id, decoder=HpackDecoder())
                h2_states[conn_id] = st
            st.feed(raw)

    decoded = []
    for conn_id, st in h2_states.items():
        if not st.decoded_headers:
            continue
        decoded.append({"connId": conn_id, "headers": st.decoded_headers})

    out = {
        "ok": True,
        "source": str(path),
        "totalEvents": total_events,
        "ioWriteEvents": io_events,
        "http1Top": [{"line": k, "count": v} for k, v in http1_counter.most_common(40)],
        "h2DecodedConnections": decoded,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
