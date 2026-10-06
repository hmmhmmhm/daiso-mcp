"""쿠키와 리다이렉트 없이 네 개의 공식 조회 경로만 호출합니다."""
import json
import sys
import urllib.request

ORIGIN = 'https://www.oliveyoung.co.kr'
PATHS = frozenset([
    '/oystore/api/storeFinder/find-store',
    '/oystore/api/stock/product-search-v3',
    '/oystore/api/stock/stock-goods-info-v3',
    '/oystore/api/stock/stock-stores',
])
LIMIT = 2 * 1024 * 1024
HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'Origin': ORIGIN,
    'Referer': ORIGIN + '/',
    'Accept-Language': 'ko-KR,ko;q=0.9',
}

class RelayError(Exception):
    """상위 응답 본문을 노출하지 않는 고정 오류입니다."""

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def fetch(path, body):
    if not isinstance(path, str) or path not in PATHS or not isinstance(body, dict):
        raise RelayError('Invalid request')
    try:
        payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(payload) > LIMIT:
            raise RelayError('Invalid request')
        request = urllib.request.Request(ORIGIN + path, data=payload, headers=HEADERS, method='POST')
        # 환경 프록시와 리다이렉트를 모두 차단합니다.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=15) as response:
            if response.status != 200:
                raise RelayError('Upstream unavailable')
            raw = response.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise RelayError('Upstream unavailable')
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get('status') != 'SUCCESS' or not isinstance(result.get('data'), dict):
            raise RelayError('Upstream unavailable')
        return result
    except Exception:
        raise RelayError('Upstream unavailable') from None

def main():
    if sys.argv[1:] == ['--check']:
        print('{"ready":true}')
        return 0
    try:
        if sys.argv[1:]:
            raise RelayError('Invalid request')
        raw = sys.stdin.buffer.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise RelayError('Invalid request')
        request = json.loads(raw)
        if not isinstance(request, dict) or set(request) != {'path', 'body'}:
            raise RelayError('Invalid request')
        result = fetch(request['path'], request['body'])
        output = json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
        if len(output) > LIMIT:
            raise RelayError('Upstream unavailable')
        sys.stdout.buffer.write(output)
        return 0
    except Exception:
        print('HTTP relay request failed', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
