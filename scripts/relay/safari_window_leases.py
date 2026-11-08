"""Shared bounded Safari window admission; no window targeting or foreign cleanup."""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

MAX_WINDOWS = 4

@contextlib.contextmanager
def gate(root, name='window-admission.lock'):
    fd = os.open(root / name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise RuntimeError('Unsafe Safari admission lock')
        deadline = time.monotonic() + 5
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Safari window creation busy; retry briefly, do not remove locks')
                time.sleep(.05)
        yield
    finally:
        os.close(fd)


def slots(root):
    folder = root / 'window-slots'
    folder.mkdir(mode=0o700, exist_ok=True)
    info = folder.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('Unsafe Safari slot directory')
    return folder


def check_resources():
    memory = subprocess.check_output(['memory_pressure', '-Q'], text=True, timeout=3)
    match = re.search(r'System-wide memory free percentage:\s*(\d+)%', memory)
    if not match or int(match[1]) < 20 or int(match[1]) > 100:
        raise RuntimeError('Safari memory admission refused or unavailable; retry after recovery')
    rows = subprocess.check_output(['ps', '-axo', '%cpu='], text=True, timeout=3).split()
    if not rows:
        raise RuntimeError('Safari CPU observation unavailable')
    values = [float(x) for x in rows]
    if any(not 0 <= x < float('inf') for x in values) or sum(values) / (os.cpu_count() or 1) > 85:
        raise RuntimeError('Safari CPU admission refused; retry after recovery')


def reserve(root, session):
    check_resources()
    with gate(root):
        folder = slots(root)
        key = hashlib.sha256(str(session).encode()).hexdigest() + '.json'
        if (folder / key).exists():
            raise RuntimeError('Safari session already owns a window slot')
        count = len(list(folder.glob('*.json'))) + int((root / 'work-session.lock').exists())
        if count >= MAX_WINDOWS:
            raise RuntimeError('Safari window capacity reached (4); close only your own completed task')
        fd = os.open(folder / key, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump({'session': str(session)}, out)


def release(root, session):
    with gate(root):
        folder = slots(root)
        key = hashlib.sha256(str(session).encode()).hexdigest() + '.json'
        file = folder / key
        try:
            info = file.lstat()
        except FileNotFoundError:
            return
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077
                or json.loads(file.read_text()).get('session') != str(session)):
            raise RuntimeError('Safari slot ownership mismatch; preserve record')
        file.unlink()
