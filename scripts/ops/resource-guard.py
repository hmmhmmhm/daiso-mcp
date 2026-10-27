#!/usr/bin/env python3
"""검사 중복과 자원 고갈을 막고 자신이 시작한 프로세스 그룹만 회수합니다."""
from contextlib import contextmanager
import fcntl
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time


def parse_memory(text):
    match = re.search(r'System-wide memory free percentage:\s*(\d+)%', text)
    if not match or not 0 <= int(match[1]) <= 100:
        raise ValueError('Memory observation unavailable')
    return int(match[1])


def parse_processes(text, cores):
    cpu, browsers, count = 0.0, {}, 0
    for line in text.splitlines():
        row = line.strip().split(None, 3)
        if len(row) != 4:
            raise ValueError('Process observation unavailable')
        value = float(row[2])
        if not math.isfinite(value) or value < 0:
            raise ValueError('CPU observation unavailable')
        cpu += value
        # 헬퍼·렌더러 수를 Chrome 본체 수로 잘못 계산하지 않습니다.
        name = row[3].rsplit('/', 1)[-1]
        if name in ['Google Chrome', 'Google Chrome for Testing', 'Google Chrome Canary',
                    'Chromium', 'chrome', 'headless_shell', 'chrome-headless-shell']:
            browsers[int(row[0])] = int(row[1])
        count += 1
    if not count:
        raise ValueError('Process observation unavailable')
    # Linux 자식 렌더러도 같은 실행파일 이름을 쓰므로 브라우저 부모가 있는 자식은 제외합니다.
    return round(cpu / max(1, cores), 1), sum(parent not in browsers for parent in browsers.values())


def snapshot():
    if sys.platform == 'darwin':
        free = parse_memory(subprocess.check_output(['memory_pressure', '-Q'], text=True, timeout=3))
    else:
        values = dict(re.findall(r'^(MemTotal|MemAvailable):\s+(\d+)', Path('/proc/meminfo').read_text(), re.M))
        free = round(int(values['MemAvailable']) / int(values['MemTotal']) * 100, 1)
    cpu, browsers = parse_processes(subprocess.check_output(
        ['ps', '-axo', 'pid=,ppid=,%cpu=,comm='], text=True, timeout=3), os.cpu_count() or 1)
    return {'freePercent': free, 'cpuPercent': cpu, 'browsers': browsers}


def conditions(value, starting=False):
    return {'memory': value['freePercent'] < (20 if starting else 12),
            'browsers': value['browsers'] > 2,
            'cpu': value['cpuPercent'] > (85 if starting else 90)}


def reason(value, starting=False):
    return next((key for key, failed in conditions(value, starting).items() if failed), None)


def emit(event, **fields):
    print(json.dumps({'resourceGuard': event, **fields}), file=sys.stderr, flush=True)


@contextmanager
def lease(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise ValueError('Unsafe lock file')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def stop(child):
    # start_new_session으로 생성한 그룹만 대상으로 하며 공용 브라우저는 건드리지 않습니다.
    if child.poll() is None:
        try:
            if os.getpgid(child.pid) != child.pid:
                raise ValueError('Owned process group mismatch')
        except ProcessLookupError:
            pass
    def send(sig):
        try:
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            pass
        except PermissionError:
            # macOS는 좀비만 남은 그룹에도 EPERM을 반환할 수 있습니다.
            rows = subprocess.check_output(['ps', '-axo', 'pgid=,stat='], text=True, timeout=3)
            if any(row.split()[0] == str(child.pid) and not row.split()[1].startswith('Z')
                   for row in rows.splitlines() if len(row.split()) == 2):
                raise
    send(signal.SIGTERM)
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    send(signal.SIGKILL)
    child.wait(timeout=3)


def watch(child, probe=snapshot, interval=2):
    streaks, ticks = {'memory': 0, 'browsers': 0, 'cpu': 0}, 0
    try:
        while child.poll() is None:
            try:
                value = probe()
            except Exception:
                emit('observation-failed')
                stop(child)
                return 75
            for key, failed in conditions(value).items():
                streaks[key] = streaks[key] + 1 if failed else 0
            failure = next((key for key, streak in streaks.items()
                            if streak >= (15 if key == 'cpu' else 3)), None)
            if ticks % 15 == 0:
                emit('sample', **value)
            if failure:
                emit('stopped', reason=failure, **value)
                stop(child)
                return 75
            ticks += 1
            time.sleep(interval)
        code = child.returncode if child.returncode >= 0 else 128 - child.returncode
        stop(child)
        return code
    except BaseException:
        stop(child)
        raise


def main(args):
    if args == ['--status']:
        print(json.dumps(snapshot()))
        return 0
    if not args or args[0] != '--' or len(args) < 2:
        emit('usage', usage='resource-guard.py --status | -- command [args]')
        return 64
    # Actions와 GUI 셸의 TMPDIR이 달라도 같은 사용자 잠금을 공유합니다.
    lock = Path('/tmp') / ('daiso-resource-guard-%s.lock' % os.getuid())
    try:
        with lease(lock):
            value = snapshot()
            failure = reason(value, True)
            if failure:
                emit('refused', reason=failure, **value)
                return 75
            # 환경 지정으로 병렬 수가 상한을 넘지 않도록 제한합니다.
            env = os.environ.copy()
            cap = 1 if sys.platform == 'darwin' else 2
            requested = int(env.get('VITEST_MAX_WORKERS', cap))
            env['VITEST_MAX_WORKERS'] = str(max(1, min(requested, cap)))
            emit('started', workers=int(env['VITEST_MAX_WORKERS']), **value)
            child = subprocess.Popen(args[1:], env=env, start_new_session=True)
            return watch(child)
    except BlockingIOError:
        emit('refused', reason='another-check-running')
        return 75
    except (ValueError, OSError, subprocess.SubprocessError, KeyError):
        emit('observation-or-launch-failed')
        return 75


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
