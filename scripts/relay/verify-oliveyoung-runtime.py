#!/usr/bin/env python3
"""plist와 OY runtime 파일이 같은 설치를 가리키는지 읽기 전용으로 확인합니다."""
import hashlib
import os
import plistlib
import stat
import sys


LABEL = 'page.aka.daiso-oliveyoung'
ENTRYPOINT = ('scripts', 'relay', 'start.ts')
FILES = (
    ('scripts', 'relay', 'oliveyoung-safari.py'),
    ('scripts', 'relay', 'safari-lifecycle.ts'),
)
MAX_PLIST_BYTES = 1024 * 1024
MAX_SOURCE_BYTES = 1024 * 1024
NOFOLLOW = getattr(os, 'O_NOFOLLOW', None)
NONBLOCK = getattr(os, 'O_NONBLOCK', None)
DIRECTORY = getattr(os, 'O_DIRECTORY', None)


class Rejected(Exception):
    def __init__(self, code):
        self.code = code


def _path_parts(value):
    if not isinstance(value, str) or not value.startswith('/'):
        raise Rejected('path-invalid')
    if any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in value):
        raise Rejected('path-invalid')
    if os.path.normpath(value) != value:
        raise Rejected('path-invalid')
    parts = value.split('/')[1:]
    if any(part in ('', '.', '..') for part in parts):
        raise Rejected('path-invalid')
    return parts


def _open_absolute(value, *, directory=False):
    parts = _path_parts(value)
    flags = os.O_RDONLY | NOFOLLOW | NONBLOCK | DIRECTORY
    try:
        descriptor = os.open('/', flags)
    except OSError:
        raise Rejected('path-unreadable') from None
    try:
        for index, part in enumerate(parts):
            is_directory = directory or index < len(parts) - 1
            component_flags = os.O_RDONLY | NOFOLLOW | NONBLOCK
            if is_directory:
                component_flags |= DIRECTORY
            try:
                child = os.open(part, component_flags, dir_fd=descriptor)
            except (OSError, ValueError):
                raise Rejected('path-unreadable') from None
            previous = descriptor
            descriptor = child
            os.close(previous)
        info = os.fstat(descriptor)
        if directory and not stat.S_ISDIR(info.st_mode):
            raise Rejected('path-not-directory')
        if not directory and not stat.S_ISREG(info.st_mode):
            raise Rejected('path-not-regular')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _open_relative_file(root_fd, parts):
    descriptor = os.dup(root_fd)
    try:
        for index, part in enumerate(parts):
            flags = os.O_RDONLY | NOFOLLOW | NONBLOCK
            if index < len(parts) - 1:
                flags |= DIRECTORY
            try:
                child = os.open(part, flags, dir_fd=descriptor)
            except (OSError, ValueError):
                raise Rejected('file-unreadable') from None
            previous = descriptor
            descriptor = child
            os.close(previous)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise Rejected('file-not-regular')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _read_regular(descriptor, limit):
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode):
        raise Rejected('file-not-regular')
    if info.st_size <= 0 or info.st_size > limit:
        raise Rejected('file-size-invalid')
    output = bytearray()
    while len(output) <= limit:
        chunk = os.read(descriptor, min(65536, limit + 1 - len(output)))
        if not chunk:
            break
        output.extend(chunk)
    after = os.fstat(descriptor)
    if len(output) > limit or len(output) != info.st_size:
        raise Rejected('file-size-invalid')
    if (after.st_dev, after.st_ino, after.st_size) != (info.st_dev, info.st_ino, info.st_size):
        raise Rejected('file-changed')
    return bytes(output)


def _read_absolute(value, limit):
    descriptor = _open_absolute(value)
    try:
        return _read_regular(descriptor, limit)
    finally:
        os.close(descriptor)


def _read_relative(root_fd, parts):
    descriptor = _open_relative_file(root_fd, parts)
    try:
        return _read_regular(descriptor, MAX_SOURCE_BYTES)
    finally:
        os.close(descriptor)


def _verify(phase, plist_path, runtime_candidate, source_root):
    if phase not in ('plan', 'exact'):
        raise Rejected('phase-invalid')
    if (NOFOLLOW is None or NONBLOCK is None or DIRECTORY is None
            or os.open not in getattr(os, 'supports_dir_fd', set())):
        raise Rejected('platform-unsupported')
    try:
        plist_data = _read_absolute(plist_path, MAX_PLIST_BYTES)
    except Rejected:
        raise Rejected('plist-unreadable') from None
    try:
        agent = plistlib.loads(plist_data)
    except Exception:
        raise Rejected('plist-invalid') from None
    if not isinstance(agent, dict) or agent.get('Label') != LABEL:
        raise Rejected('label-mismatch')
    if 'Program' in agent:
        raise Rejected('program-override')

    runtime_path = agent.get('WorkingDirectory')
    if not isinstance(runtime_path, str) or runtime_candidate != runtime_path:
        raise Rejected('runtime-mismatch')
    try:
        runtime_fd = _open_absolute(runtime_path, directory=True)
    except Rejected:
        raise Rejected('runtime-invalid') from None
    try:
        arguments = agent.get('ProgramArguments')
        if (not isinstance(arguments, list) or len(arguments) != 6
                or not all(isinstance(value, str) for value in arguments)
                or not arguments[0].startswith('/')
                or arguments[0].rsplit('/', 1)[-1] != 'node'
                or arguments[1] != '--max-old-space-size=256'
                or not arguments[2].startswith('--env-file=')):
            raise Rejected('program-arguments-invalid')
        try:
            _path_parts(arguments[2][len('--env-file='):])
        except Rejected:
            raise Rejected('program-arguments-invalid') from None
        expected_entrypoint = runtime_path.rstrip('/') + '/' + '/'.join(ENTRYPOINT)
        if arguments[3:] != ['--import', 'tsx', expected_entrypoint]:
            raise Rejected('entrypoint-mismatch')
        try:
            _read_relative(runtime_fd, ENTRYPOINT)
        except Rejected:
            raise Rejected('entrypoint-invalid') from None

        try:
            source_fd = _open_absolute(source_root, directory=True)
        except Rejected:
            raise Rejected('source-invalid') from None
        try:
            for relative in FILES:
                try:
                    source_data = _read_relative(source_fd, relative)
                except Rejected:
                    raise Rejected('source-file-invalid') from None
                try:
                    runtime_data = _read_relative(runtime_fd, relative)
                except Rejected:
                    raise Rejected('runtime-file-invalid') from None
                if (phase == 'exact'
                        and hashlib.sha256(source_data).digest() != hashlib.sha256(runtime_data).digest()):
                    raise Rejected('file-mismatch')
        finally:
            os.close(source_fd)
    finally:
        os.close(runtime_fd)


def verify(phase, plist_path, runtime_candidate, source_root):
    try:
        _verify(phase, plist_path, runtime_candidate, source_root)
    except Rejected as error:
        return 'reject:' + error.code
    except Exception:
        return 'reject:internal-error'
    return 'target-ready' if phase == 'plan' else 'files-match'


def main(arguments=None):
    values = sys.argv[1:] if arguments is None else arguments
    if len(values) != 4:
        print('oy-runtime-preflight=reject:arguments-invalid')
        return 2
    result = verify(values[0], values[1], values[2], values[3])
    print('oy-runtime-preflight=' + result)
    return 0 if result in ('target-ready', 'files-match') else 1


if __name__ == '__main__':
    raise SystemExit(main())
