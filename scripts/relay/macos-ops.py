#!/usr/bin/python3
"""현재 사용자의 Mac 중계 보조 도구. plan/status/install/monitor는 비밀값을 출력하지 않습니다."""
import argparse
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import plistlib
import shlex
import shutil
import stat
import socket
import threading
import subprocess
import sys
import tempfile
import time

HIDE_LABEL = 'page.aka.daiso-ops-hide'
MONITOR_LABEL = 'page.aka.daiso-ops-monitor'
OWNER = 'daiso-mcp-macos-ops-v1'
CAP = 65536


def validate_path(path, private=False, directory=False):
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('Absolute path required')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ValueError('Symbolic link refused')
    if path.exists():
        info = path.stat()
        if info.st_uid != os.getuid():
            raise ValueError('Foreign owner refused')
        if directory != stat.S_ISDIR(info.st_mode):
            raise ValueError('Unexpected file type')
        if not directory and not stat.S_ISREG(info.st_mode):
            raise ValueError('Regular file required')
        if info.st_mode & (0o077 if private else 0o022):
            raise ValueError('Unsafe permissions')
    return path


def private_json(path):
    validate_path(path, private=True)
    if path.stat().st_size > CAP:
        raise ValueError('Private file too large')
    return json.loads(path.read_text())


def read_env(path):
    validate_path(path, private=True)
    if path.stat().st_size > CAP:
        raise ValueError('Environment file too large')
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise ValueError('Invalid environment file')
        key, value = line.split('=', 1)
        if key.startswith('export '):
            key = key[7:]
        parts = shlex.split(value, comments=True)
        if len(parts) > 1 or not key.replace('_', '').isalnum():
            raise ValueError('Invalid environment value')
        values[key] = parts[0] if parts else ''
    return values


def safe_health(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid health object')
    result = {}
    # 허용된 상태와 숫자만 남기고 원본 문자열·응답·토큰은 저장하지 않습니다.
    for key in ['status', 'state']:
        if value.get(key) in ['ok', 'ready', 'running', 'starting', 'failed', 'stopped', 'unavailable', 'needs-login', 'healthy', 'degraded', 'closed', 'idle']:
            result[key] = value[key]
    for key in ['active', 'outstanding', 'queued', 'consecutiveFailures']:
        if type(value.get(key)) is int and 0 <= value[key] <= 1000000:
            result[key] = value[key]
    if type(value.get('firstFailedAt')) in [int, float] and math.isfinite(value['firstFailedAt']) and value['firstFailedAt'] >= 0:
        result['firstFailedAt'] = value['firstFailedAt']
    if value.get('reason') in ['health-unavailable', 'readiness-unavailable', 'authentication-unobservable', 'own-quota']:
        result['reason'] = value['reason']
    auth = value.get('authentication')
    if isinstance(auth, dict):
        result['authentication'] = {}
        if auth.get('state') in ['ready', 'missing', 'expired', 'refreshing', 'failed', 'needs-login', 'login-required', 'refresh-failed', 'unavailable', 'login_required', 'retry_wait', 'unloaded']:
            result['authentication']['state'] = auth['state']
        if type(auth.get('loginRequired')) is bool:
            result['authentication']['loginRequired'] = auth['loginRequired']
        for key in ['accessExpiresAt', 'refreshExpiresAt', 'retryAt']:
            item = auth.get(key)
            if item is None or (type(item) in [int, float] and math.isfinite(item) and item >= 0):
                result['authentication'][key] = item
    for section in ['logging', 'quota']:
        data = value.get(section)
        if isinstance(data, dict):
            result[section] = {key: item for key, item in data.items()
                               if key in ['enabled', 'failed', 'remaining', 'used', 'limit', 'day', 'month', 'requests', 'bytes', 'dropped', 'errors', 'lowSpace', 'queued', 'written', 'dailyRemaining', 'minuteRemaining', 'retryAfter']
                               and (type(item) is bool or (type(item) is int and 0 <= item <= 10**12))}
    quota = value.get('quota')
    if isinstance(quota, dict) and 'blockedBy' in quota and quota['blockedBy'] in [None, 'minute', 'daily']:
        result['quota']['blockedBy'] = quota['blockedBy']
    return result


def authentication_observable(value):
    auth = value.get('authentication')
    if not isinstance(auth, dict) or type(auth.get('loginRequired')) is not bool:
        return False
    if auth.get('state') not in ['ready', 'refreshing', 'retry_wait', 'login_required', 'unloaded']:
        return False
    if auth['state'] == 'ready':
        now_ms = time.time() * 1000
        for key in ['accessExpiresAt', 'refreshExpiresAt']:
            expiry = auth.get(key)
            if type(expiry) not in [int, float] or not math.isfinite(expiry) or expiry <= now_ms:
                return False
    return True


def check_failed(value):
    return ((value.get('status') != 'ok' and value.get('state') != 'ready')
            or value.get('state') in ['failed', 'closed', 'stopped', 'unavailable', 'degraded']
            or value.get('authentication', {}).get('loginRequired') is True
            or value.get('authentication', {}).get('state') in ['login_required', 'retry_wait', 'unloaded', 'failed']
            or value.get('logging', {}).get('failed') is True
            or value.get('logging', {}).get('lowSpace') is True
            or value.get('logging', {}).get('errors', 0) > 0
            or value.get('quota', {}).get('blockedBy') in ['minute', 'daily'])


def fetch_health(port, path, token=None):
    # http.client는 환경 프록시를 사용하거나 리디렉션을 따라가지 않습니다.
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    timer = None
    expired = threading.Event()
    try:
        connection.connect()
        transport = connection.sock
        def expire():
            expired.set()
            try:
                transport.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        timer = threading.Timer(4, expire)
        timer.daemon = True
        timer.start()
        headers = {'Authorization': 'Bearer ' + token} if token else {}
        connection.request('GET', path, headers=headers)
        response = connection.getresponse()
        deadline = time.monotonic() + 4
        chunks = []
        size = 0
        while True:
            if time.monotonic() > deadline:
                raise ValueError('Health deadline')
            part = response.read(min(4096, CAP + 1 - size))
            size += len(part)
            if size > CAP:
                raise ValueError('Health body limit')
            if not part:
                break
            chunks.append(part)
        if expired.is_set() or response.status != 200:
            raise ValueError('Health HTTP failure')
        return json.loads(b''.join(chunks)) if token else {'status': 'ok'}
    finally:
        if timer:
            timer.cancel()
        connection.close()


def write_snapshot(path, value):
    validate_path(path, private=True)
    validate_path(path.parent, private=True, directory=True)
    content = (json.dumps(value, allow_nan=False) + '\n').encode()
    if len(content) > CAP:
        raise ValueError('Snapshot too large')
    descriptor, name = tempfile.mkstemp(prefix='.ops-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        validate_path(path, private=True)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def login_notification(checks, previous, now, enabled):
    required = checks.get('convenience', {}).get('authentication', {}).get('loginRequired') is True
    if not required:
        return {'state': 'not-required'}
    old = previous.get('notification', {})
    if not enabled:
        return {'state': 'disabled'}
    last = old.get('attemptedAt', 0)
    if type(last) in [int, float] and 0 <= now - last < 21600 and old.get('state') in ['accepted', 'failed']:
        return old
    result = {'state': 'failed', 'attemptedAt': now}
    try:
        subprocess.run(['/usr/bin/osascript', '-e',
                        'display notification "GS25 정상 로그인이 필요합니다. 운영 상태와 복구 절차를 확인해 주세요." with title "DaisoRelay 인증 확인"'],
                       check=True, capture_output=True, timeout=5)
        result['state'] = 'accepted'
    except (OSError, subprocess.SubprocessError):
        pass
    return result


def monitor(base, tunnel_port, notify_local=False):
    checked_at = time.time()
    checks = {}
    for name, env_file, token_key, port, path in [
        ('oliveyoung', 'relay.env', 'OY_RELAY_TOKEN', 4319, '/health'),
        ('dtryx', 'dtryx.env', 'DTRYX_RELAY_TOKEN', 4320, '/v1/dtryx/health'),
        ('cgv', 'dtryx.env', 'DTRYX_RELAY_TOKEN', 4320, '/v1/cgv/health'),
        ('convenience', 'dtryx.env', 'CONVENIENCE_RELAY_TOKEN', 4320, '/v1/convenience/health'),
    ]:
        try:
            environment = read_env(base / env_file)
            token = environment.get(token_key)
            if not token or '\r' in token or '\n' in token:
                raise ValueError('Missing token')
            safe = safe_health(fetch_health(port, path, token))
            checks[name] = dict(safe, failed=check_failed(safe))
            if safe.get('quota', {}).get('blockedBy') in ['minute', 'daily']:
                checks[name]['reason'] = 'own-quota'
            if name == 'convenience' and environment.get('GS25_AUTH_SESSION_FILE', '').strip() and not authentication_observable(safe):
                checks[name].update(failed=True, reason='authentication-unobservable')
        except (OSError, ValueError, http.client.HTTPException):
            checks[name] = {'failed': True, 'reason': 'health-unavailable'}
    if tunnel_port:
        try:
            fetch_health(tunnel_port, '/ready')
            checks['tunnel'] = {'failed': False, 'status': 'ok'}
        except (OSError, ValueError, http.client.HTTPException):
            checks['tunnel'] = {'failed': True, 'reason': 'readiness-unavailable'}
    previous_status = snapshot_status(base / 'ops-status.json')
    previous = previous_status.get('checks', {})
    for name, check in checks.items():
        old = previous.get(name, {})
        if check['failed']:
            check['consecutiveFailures'] = min(old.get('consecutiveFailures', 0) + 1, 1000000)
            check['firstFailedAt'] = old.get('firstFailedAt', checked_at)
        else:
            check['consecutiveFailures'] = 0
    result = {'checkedAt': checked_at, 'failed': any(v['failed'] for v in checks.values()), 'checks': checks}
    result['notification'] = login_notification(checks, previous_status, checked_at, notify_local)
    write_snapshot(base / 'ops-status.json', result)
    return result


def snapshot_status(path, now=None):
    try:
        value = private_json(path)
        checked = value.get('checkedAt')
        if type(checked) not in [int, float] or not math.isfinite(checked):
            raise ValueError('Invalid snapshot')
        # 임의로 바뀐 스냅숏도 출력 전에 다시 허용 목록으로 제한합니다.
        checks = {name: dict(safe_health(item), failed=item.get('failed') is True)
                  for name, item in value.get('checks', {}).items()
                  if name in ['oliveyoung', 'dtryx', 'cgv', 'convenience', 'tunnel'] and isinstance(item, dict)}
        notification = value.get('notification', {})
        safe_notification = {'state': notification.get('state') if notification.get('state') in ['accepted', 'failed', 'disabled', 'not-required'] else 'unknown'}
        attempted = notification.get('attemptedAt')
        if type(attempted) in [int, float] and math.isfinite(attempted) and attempted >= 0:
            safe_notification['attemptedAt'] = attempted
        return {'notification': safe_notification, 'checkedAt': checked, 'stale': not 0 <= (time.time() if now is None else now) - checked <= 180,
                'failed': not all(name in checks for name in ['oliveyoung', 'dtryx', 'cgv', 'convenience']) or any(item['failed'] for item in checks.values()), 'checks': checks}
    except FileNotFoundError:
        return {'stale': True, 'failed': True, 'reason': 'snapshot-missing'}


def agent_plists(base, home, version, tunnel_port, notify_local=False):
    common = {'RunAtLoad': True, 'LimitLoadToSessionType': 'Aqua', 'ProcessType': 'Background',
              'StandardOutPath': '/dev/null', 'StandardErrorPath': '/dev/null',
              'EnvironmentVariables': {'DAISO_OPS_OWNER': OWNER}}
    hide = dict(common, Label=HIDE_LABEL, KeepAlive=True, ThrottleInterval=60,
                ProgramArguments=[str(version / 'hide-oliveyoung'), '--state-base', str(base), '--runtime', str(home)])
    mon = dict(common, Label=MONITOR_LABEL, StartInterval=60,
               ProgramArguments=['/usr/bin/python3', str(version / 'macos-ops.py'), 'monitor',
                                 '--state-base', str(base), '--tunnel-port', str(tunnel_port)])
    if notify_local:
        mon['ProgramArguments'].append('--notify-local')
    return {HIDE_LABEL: hide, MONITOR_LABEL: mon}


def make_plan(base, runtime, tunnel_port):
    if not 0 <= tunnel_port <= 65535 or 0 < tunnel_port < 1024:
        raise ValueError('Invalid tunnel port')
    for path in [base, runtime]:
        validate_path(path, directory=True)
    return {'stateBase': str(base), 'runtime': str(runtime),
            'labels': [HIDE_LABEL, MONITOR_LABEL], 'tunnelPort': tunnel_port,
            'preserves': ['relay.env', 'dtryx.env', 'credentials', 'quota', 'runtime', 'existing LaunchAgents']}


def install(base, runtime, tunnel_port, agents, notify_local=False):
    make_plan(base, runtime, tunnel_port)
    validate_path(base, private=True, directory=True)
    validate_path(agents, directory=True)
    source = Path(__file__).absolute().parent
    payloads = {name: (source / name).read_bytes() for name in ['macos-ops.py', 'hide-oliveyoung.swift']}
    digest = hashlib.sha256(b''.join(payloads.values())).hexdigest()[:16]
    helpers = base / 'ops-helpers'
    version = helpers / digest
    validate_path(helpers, private=True, directory=True)
    validate_path(version, private=True, directory=True)
    plists = agent_plists(base, runtime, version, tunnel_port, notify_local)
    for label in plists:
        path = agents / (label + '.plist')
        validate_path(path)
        if path.exists() and plistlib.loads(path.read_bytes()).get('EnvironmentVariables', {}).get('DAISO_OPS_OWNER') != OWNER:
            raise ValueError('Foreign LaunchAgent refused')
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    helpers.mkdir(mode=0o700, exist_ok=True)
    agents.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not version.exists():
        stage = Path(tempfile.mkdtemp(prefix='.stage-', dir=str(helpers)))
        try:
            for name, content in payloads.items():
                (stage / name).write_bytes(content)
                (stage / name).chmod(0o600)
            subprocess.run(['/usr/bin/swiftc', str(stage / 'hide-oliveyoung.swift'), '-o', str(stage / 'hide-oliveyoung')], check=True, capture_output=True)
            (stage / 'hide-oliveyoung').chmod(0o700)
            stage.rename(version)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    else:
        for name, content in payloads.items():
            validate_path(version / name, private=True)
            if (version / name).read_bytes() != content:
                raise ValueError('Modified managed helper refused')
        validate_path(version / 'hide-oliveyoung', private=True)
        if not os.access(version / 'hide-oliveyoung', os.X_OK):
            raise ValueError('Managed helper is not executable')
    for label, plist in plists.items():
        path = agents / (label + '.plist')
        if path.exists():
            backup = path.with_name(path.name + '.backup-' + str(time.time_ns()))
            descriptor = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(path.read_bytes())
        descriptor, temporary = tempfile.mkstemp(prefix='.ops-plist-', dir=str(agents))
        try:
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(plistlib.dumps(plist))
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return {'installed': True, 'loaded': False, 'labels': list(plists)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'status', 'install', 'monitor'])
    parser.add_argument('--state-base', type=Path, default=Path.home() / 'Library/Application Support/DaisoRelay')
    parser.add_argument('--runtime', type=Path)
    parser.add_argument('--tunnel-port', type=int, default=20242, help='0 disables tunnel readiness')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--notify-local', action='store_true', help='Enable fixed local login-required notification')
    args = parser.parse_args()
    base = args.state_base
    runtime = args.runtime or base / 'runtime'
    try:
        if args.command == 'status':
            validate_path(base, private=True, directory=True)
            result = snapshot_status(base / 'ops-status.json')
        elif args.command == 'monitor':
            if not 0 <= args.tunnel_port <= 65535 or 0 < args.tunnel_port < 1024:
                raise ValueError('Invalid tunnel port')
            result = monitor(base, args.tunnel_port, args.notify_local)
        elif args.command == 'install' and args.apply:
            if sys.platform != 'darwin' or os.getuid() == 0:
                raise ValueError('Run as current Mac GUI user')
            result = install(base, runtime, args.tunnel_port, Path.home() / 'Library/LaunchAgents', args.notify_local)
        else:
            result = make_plan(base, runtime, args.tunnel_port)
            result['applied'] = False
            result['notifyLocal'] = args.notify_local
        print(json.dumps(result, allow_nan=False))
    except (OSError, ValueError, subprocess.SubprocessError):
        print(json.dumps({'failed': True, 'reason': 'unsafe-or-unavailable-input'}))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
