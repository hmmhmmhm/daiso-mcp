#!/usr/bin/env python3
"""로컬 스킬의 고정 창과 전역 잠금으로 올리브영 조회를 직렬 실행합니다."""
import contextlib
import importlib.util
import io
import json
import os
import signal
import sys
import time
from pathlib import Path


def operate(helper, session, *args):
    old = sys.argv
    output = io.StringIO()
    try:
        sys.argv = ['safari.py', '--session', str(session), *args]
        with contextlib.redirect_stdout(output):
            helper.main()
        return json.loads(output.getvalue())
    finally:
        sys.argv = old


def evaluate(helper, state, code):
    return json.loads(helper.js(state, code))


def interrupt(_signal, _frame):
    raise TimeoutError('interrupted')


def main():
    base = Path(sys.argv[1]).resolve()
    helper_path = Path.home() / '.codex/skills/safari-minimized/scripts/safari.py'
    spec = importlib.util.spec_from_file_location('safari_owned', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    session = base / ('safari-session-' + str(os.getpid()) + '.json')
    held = Path(helper.LOCK.read_text().strip()).resolve() if helper.LOCK.exists() else None
    unresolved = any(base.glob('safari-session*.json')) or (
        held is not None and held.parent == base and held.name.startswith('safari-session')
        and held.suffix == '.json')
    if '--check' in sys.argv:
        # 준비 시 권한만 확인하고 다른 작업창을 취득하지 않습니다.
        helper.ensure_safari()
        if unresolved:
            raise RuntimeError('unresolved-session')
        print(json.dumps({'ready': True}))
        return
    payload = json.loads(sys.stdin.read(65537))
    if not isinstance(payload.get('script'), str) or not isinstance(payload.get('args'), dict):
        raise ValueError('invalid-input')
    origin = payload['args'].get('origin', 'https://www.oliveyoung.co.kr')
    path = payload['args'].get('path', '').split('?')[0]
    allowed = {
        'https://www.oliveyoung.co.kr': [
            '/oystore/api/storeFinder/find-store', '/oystore/api/stock/product-search-v3',
            '/oystore/api/stock/stock-goods-info-v3', '/oystore/api/stock/stock-stores',
            '/store/main/getHotdealList.do', '/store/main/getHotdealPagingListAjax.do',
        ],
        'https://new.7-elevenapp.co.kr': [
            '/api/v1/open/search/goods', '/api/v1/open/search/store', '/api/v1/open/search/popword',
            '/api/v1/open/product/search/stock', '/api/v1/open/stock/search/stores',
            '/api/v1/open/real-stock/multi', '/api/v1/open/real-stock/multi/01/stocks',
            '/api/v1/product/pages', '/api/v1/product/issues', '/api/v1/exhibition/main/list',
        ],
    }
    if origin not in allowed or path not in allowed[origin]:
        raise ValueError('invalid-path')
    if unresolved:
        raise RuntimeError('unresolved-session')
    if helper.LOCK.exists():
        print(json.dumps({'relayError': 'safari-busy'}))
        return
    signal.signal(signal.SIGTERM, interrupt)
    result = None
    try:
        operate(helper, session, 'start')
        operate(helper, session, 'navigate', origin + '/robots.txt')
        state = json.loads(session.read_text())
        key = '__daisoRelay_' + helper.uuid.uuid4().hex
        code = ('const __name=(fn)=>fn;const key=' + json.dumps(key) + ';'
                'if(location.origin!==' + json.dumps(origin) + ')throw new Error("origin");'
                'window[key]={done:false};Promise.resolve((' + payload['script'] + ')('
                + json.dumps(payload['args']) + ')).then(value=>window[key]={done:true,value},'
                '()=>window[key]={done:true,value:{reason:"network",body:null}});return {started:true};')
        evaluate(helper, state, code)
        deadline = time.monotonic() + 16
        while time.monotonic() < deadline:
            observed = evaluate(helper, state, 'return window[' + json.dumps(key) + ']||{lost:true};')
            if observed.get('lost'):
                raise RuntimeError('context-lost')
            if observed.get('done'):
                result = observed['value']
                break
            time.sleep(.15)
        if result is None:
            raise TimeoutError('fetch-timeout')
    finally:
        # 중단 시에도 소유 창만 회수하고 불명확한 소유권은 덮어쓰지 않습니다.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        if session.exists():
            operate(helper, session, 'stop')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # URL·원문·토큰은 출력하지 않고 미회수 state/lock은 보존합니다.
        print('Safari relay request failed', file=sys.stderr)
        sys.exit(1)
