# GS25 정상 로그인 참조 코드

[운영 절차](gs25-auth-recovery-runbook.md)의 3절과 함께 사용한다. 아래 코드는 2026-10-05에 성공한 티켓 시작·callback 저장 절차를 자기 완결된 예제로 정리한 것이다. 임시 scratch의 다른 Python 모듈이 필요하지 않다. **문서 예제의 구문 검증과 당시 정상 흐름의 실증은 서로 다르다.** 다음 실행에서는 현재 공식 계약을 확인하고 결과를 새로 검증한다. 이 예제는 운영 재고 서버나 공개 로그인 endpoint로 배포하지 않는다.

빈 작업 디렉터리와 브라우저 profile을 현재 사용자만 접근할 수 있게 0700으로 만든다. 첫 코드를 `start.py`, 두 번째를 `capture.py`로 저장한다. 티켓·세션 출력은 이 파일들과 같은 비공개 디렉터리에만 생성된다. 성공한 세션을 운영 파일에 설치하는 방법은 운영 절차 4절을 따른다.

## 1. 루프백에서 새 GS 티켓 발급

`python3 start.py` 실행 후 출력된 루프백 URL을 격리된 headed browser session `gs25-native-auth`로 연다. 티켓이 만료됐거나 사용된 경우 프로세스를 종료하고 **새 작업 디렉터리**에서 다시 시작한다. 브라우저의 full URL 출력은 비공개로 캡처한다. 사용자 계정 입력은 공식 로그인 화면에서만 한다.

```python
import json
import os
import threading
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "https://b2c-bff.woodongs.com"
DEVICE = str(uuid.uuid4())
HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "woodongs-app/5.3.61 (Android; 14; sdk_gphone64_arm64)",
    "request_id": str(uuid.uuid4()),
    "appinfo_device_id": DEVICE,
    "appinfo_model_name": "sdk_gphone64_arm64",
    "appinfo_os_version": "14",
    "appinfo_app_version": "5.3.61",
    "appinfo_app_build_number": "2132",
    "appinfo_os_type": "android",
    "grm-sysCdDtl": "2011",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # 티켓과 요청 URL을 로그에 남기지 않는다.

    def do_GET(self):
        expected = f"127.0.0.1:{self.server.server_port}"
        if self.path != "/start" or self.headers.get("Host") != expected:
            self.send_error(404)
            return
        try:
            request = urllib.request.Request(
                BASE + "/api/bff/v4/grmHub/authTicket",
                data=b"{}", headers=HEADERS,
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read(131073)
                if response.status != 200 or len(raw) > 131072:
                    raise ValueError()
                value = json.loads(raw)
            if value.get("resultCode") != "0000" or not value.get("ticket"):
                raise ValueError()
            # 재로드로 이전 device/ticket을 섞지 않게 새 파일만 허용한다.
            fd = os.open(ROOT / "ticket.private.json",
                         os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w") as file:
                json.dump({"deviceId": DEVICE}, file)
            target = "https://ex-hubpage.grm.gsretail.com/bizmgt/signin/bridge?"
            target += urllib.parse.urlencode({
                "grmSysCdDtl": "2011", "page": "NAVER",
                "return": BASE + "/api/bff/v4/grmHub/authReturn",
                "ticket": value["ticket"],
            })
            self.send_response(302)
            self.send_header("Location", target)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            print(json.dumps({"ticketIssued": True}), flush=True)
        except Exception:
            self.send_error(502, "Start failed; use a new private directory")


server = HTTPServer(("127.0.0.1", 0), Handler)
print(json.dumps({"url": f"http://127.0.0.1:{server.server_port}/start"}), flush=True)
timer = threading.Timer(600, server.shutdown)
timer.daemon = True
timer.start()
try:
    server.serve_forever()
finally:
    timer.cancel()
    server.server_close()
```

초기 bridge를 읽은 뒤 운영 절차의 SPA 이동·네이버 화면 채널 확인·필요한 경우 공식 `loginNaver` 코드 교환을 수행한다.

## 2. GS authReturn만 비공개 파일로 저장

브라우저가 최종 GS 반환 주소에 도달한 뒤 `python3 capture.py`를 실행한다. URL이 아직 네이버/허브 callback이면 저장하지 않는다. 출력은 성공 여부뿐이다. `agent-browser` 자체 명령을 별도로 실행해 callback URL 전체를 터미널에 출력하지 않는다.

```python
import base64
import json
import math
import os
import re
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def valid_token(value):
    if not re.fullmatch(r"[\w-]+\.[\w-]+\.[\w-]+", value):
        raise ValueError()
    encoded = value.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    expiry = claims.get("exp")
    if (not isinstance(expiry, (int, float)) or not math.isfinite(expiry)
            or expiry <= time.time()):
        raise ValueError()
    return value


try:
    result = subprocess.run(
        ["agent-browser", "--session", "gs25-native-auth", "get", "url"],
        capture_output=True, text=True, timeout=15, check=True,
    )
    url = urllib.parse.urlsplit(result.stdout.strip())
    if (url.scheme != "https" or url.netloc != "b2c-bff.woodongs.com"
            or url.path != "/api/bff/v4/grmHub/authReturn"):
        raise ValueError()
    query = urllib.parse.parse_qs(url.query)

    def one(name):
        values = query.get(name, [])
        if len(values) != 1 or not values[0]:
            raise ValueError()
        return values[0]

    if one("result") != "Y" or one("resultCode") != "0000":
        raise ValueError()
    access = valid_token(one("token").removeprefix("Bearer "))
    refresh = valid_token(one("refresh").removeprefix("Bearer "))
    device = json.loads((ROOT / "ticket.private.json").read_text())["deviceId"]
    if not isinstance(device, str) or not re.fullmatch(r"[\w-]{1,100}", device):
        raise ValueError()
    fd = os.open(ROOT / "session.private.json",
                 os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump({"accessToken": access, "refreshToken": refresh,
                   "deviceId": device}, file)
    print(json.dumps({"authenticated": True, "sessionSaved": True}))
except Exception:
    # 예외 메시지에 URL/token이 포함될 수 있어 출력하지 않는다.
    print(json.dumps({"authenticated": False, "sessionSaved": False}))
    raise SystemExit(1)
```

`valid_token`은 형태·만료만 확인한다. 서명 검증 또는 로그인 성공의 대체물이 아니다. 이후 실제 GS 재고·갱신과 운영 REST/MCP/CLI 검증까지 완료해야 한다. 파일이 이미 있으면 덮어쓰지 않고 실패한다. 실패 시 생성된 파일의 토큰을 출력하지 말고 새 작업 디렉터리에서 정상 흐름을 다시 수행한다.
