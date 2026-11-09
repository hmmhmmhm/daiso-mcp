#!/usr/bin/env python3
"""로컬 스킬의 고정 창과 개별 창 잠금으로 올리브영 조회를 실행합니다."""
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
import re
import signal
import stat
import sys
import tempfile
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


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def retire_restarted_sessions(helper, base, current_pid):
    if not str(current_pid).isdigit() or int(current_pid) <= 0:
        return
    fd = os.open(base / '.safari-retire.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('unsafe-retirement-lock')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        for path in base.glob('safari-session-*.json'):
            match = re.fullmatch(r'safari-session-([0-9]+)\.json(\.opening\.json)?', path.name)
            info = path.lstat()
            if (not match or not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or info.st_mode & 0o077 or info.st_size > 65536):
                continue
            raw = path.read_bytes()
            try:
                state = json.loads(raw)
            except (ValueError, UnicodeError):
                continue
            if not isinstance(state, dict):
                continue
            old_pid = str(state.get('safari_pid', ''))
            opening = bool(match[2])
            session_path = path.with_name(path.name.removesuffix('.opening.json')) if opening else path
            if not old_pid.isdigit() or int(old_pid) <= 0:
                continue
            if opening:
                if not isinstance(state.get('nonce'), str) or not re.fullmatch(
                        r'about:blank#safari-owned-[0-9a-f]{32}', state['nonce']):
                    continue
            elif (int(old_pid) == int(current_pid) or type(state.get('window_id')) is not int
                    or state['window_id'] <= 0):
                continue
            owner = int(match[1])
            if not 0 < owner < 2 ** 31:
                continue
            try:
                os.kill(owner, 0)
            except ProcessLookupError:
                pass
            except PermissionError:
                continue
            else:
                continue
            archive = base / 'retired-safari-sessions'
            if archive.is_symlink():
                raise RuntimeError('unsafe-retirement-directory')
            archive.mkdir(mode=0o700, exist_ok=True)
            archive.chmod(0o700)
            saved = archive / (path.stem + '-' + hashlib.sha256(raw).hexdigest() + '.json')
            # 완성된 보존본부터 설치해 중단·재실행 때도 원본을 잃지 않습니다.
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=archive, prefix='.retire-', delete=False) as out:
                    temporary = Path(out.name)
                    out.write(raw)
                    out.flush()
                    os.fsync(out.fileno())
                try:
                    os.link(temporary, saved)
                except FileExistsError:
                    if saved.is_symlink() or saved.read_bytes() != raw:
                        raise RuntimeError('retirement-copy-mismatch')
                sync_directory(archive)
                sync_directory(base)
                if opening and int(old_pid) == int(current_pid):
                    if getattr(helper, 'OPENING_CLEANUP_VERSION', 0) < 2:
                        raise RuntimeError('opening-cleanup-helper-upgrade-required')
                    if str(helper.safari_pid()) != str(current_pid):
                        raise RuntimeError('safari-changed-during-opening-cleanup')
                    result = helper.apple(helper.opening_cleanup_script(state['nonce']))
                    if result != 'closed':
                        raise RuntimeError('unresolved-opening-window')
                own_lock = session_path.with_name(session_path.name + '.lock')
                if state.get('lock_scope') == 'window' or (
                        opening and own_lock.exists() and own_lock.read_text() == str(session_path)):
                    helper.release(session_path, True)
                try:
                    held = Path(helper.LOCK.read_text().strip())
                except FileNotFoundError:
                    held = None
                if held is not None and held.resolve() == session_path:
                    helper.release(held)
                sync_directory(helper.LOCK.parent)
                path.unlink()
                sync_directory(base)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
    finally:
        os.close(fd)


def main():
    base = Path(sys.argv[1]).resolve()
    helper_path = Path.home() / '.codex/skills/safari-minimized/scripts/safari.py'
    spec = importlib.util.spec_from_file_location('safari_owned', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    session = base / ('safari-session-' + str(os.getpid()) + '.json')
    def unresolved():
        retire_restarted_sessions(helper, base, helper.ensure_safari())
        try:
            held = Path(helper.LOCK.read_text().strip()).resolve()
        except FileNotFoundError:
            held = None
        return any(base.glob('safari-session*.json')) or any(base.glob('safari-session*.json.lock')) or (
            held is not None and held.parent == base and held.name.startswith('safari-session')
            and held.suffix == '.json')
    if '--check' in sys.argv:
        # 준비 시 권한만 확인하고 다른 작업창을 취득하지 않습니다.
        if unresolved():
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
    if unresolved():
        raise RuntimeError('unresolved-session')
    signal.signal(signal.SIGTERM, interrupt)
    result = None
    try:
        operate(helper, session, 'start', '--independent-window')
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
