"""실제 Safari를 열지 않는 소유 창 회수 회귀입니다."""
import contextlib
import importlib.util
import io
import json
import os
import signal
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'scripts/relay/oliveyoung-safari.py'
spec = importlib.util.spec_from_file_location('relay_safari', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.session = self.base / ('safari-session-' + str(os.getpid()) + '.json')
        self.lock = self.base / 'lock'
        self.calls = []
        self.helper = SimpleNamespace(ensure_safari=lambda: None, LOCK=self.lock,
                                      uuid=SimpleNamespace(uuid4=lambda: SimpleNamespace(hex='test')))
        self.payload = {'script': 'async () => ({})', 'args': {'path': '/oystore/api/stock/stock-stores'}}
        self.previous = signal.getsignal(signal.SIGTERM)

    def tearDown(self):
        signal.signal(signal.SIGTERM, self.previous)
        self.temp.cleanup()

    def write_global_lock(self, value):
        self.lock.write_text(value)
        self.lock.chmod(0o600)

    def operate(self, _helper, _session, command, *_args, decode=True):
        self.calls.append(command)
        if command == 'start':
            self.assertIn('--independent-window', _args)
            self.session.write_text('{}')
        if command == 'stop':
            self.session.unlink()
        return {'ok': True} if decode else '{"ok":true}'

    def run_main(self, *flags, values=None):
        loader = SimpleNamespace(exec_module=lambda _h: None)
        stdout = io.StringIO()
        with patch.object(m.importlib.util, 'spec_from_file_location', return_value=SimpleNamespace(loader=loader)), \
             patch.object(m.importlib.util, 'module_from_spec', return_value=self.helper), \
             patch.object(m, 'operate', side_effect=self.operate), \
             patch.object(m, 'evaluate', side_effect=values or [{'started': True}, {'done': True, 'value': {'status': 200}}]), \
             patch.object(sys, 'argv', ['helper', str(self.base), *flags]), \
             patch.object(sys, 'stdin', io.StringIO(json.dumps(self.payload))), contextlib.redirect_stdout(stdout):
            m.main()
        return json.loads(stdout.getvalue())

    def run_cli_failure(
        self, fail_at, *, stop_fails=False, stop_error=None, stop_output='{"ok":true}',
        stop_parse_error=None,
        flags=(), preserve_session=False, interrupt_at=None,
    ):
        if self.session.exists() and not preserve_session:
            self.session.unlink()
        loader = SimpleNamespace(exec_module=lambda _h: None)
        stdout = io.StringIO()
        stderr = io.StringIO()
        calls = {'evaluate': 0}

        def operate(_helper, _session, command, *_args, decode=True):
            self.calls.append(command)
            if command == fail_at:
                raise RuntimeError('private URL cookie body detail')
            if command == 'start':
                self.session.write_text('{}')
            if command == 'stop':
                if stop_error is not None:
                    raise stop_error
                if stop_fails:
                    raise RuntimeError('private stop detail')
                self.session.unlink()
                return {'ok': True} if decode else stop_output
            return {'ok': True}

        def evaluate(_helper, _state, _code):
            calls['evaluate'] += 1
            if interrupt_at == calls['evaluate']:
                m.interrupt(signal.SIGTERM, None)
            if fail_at == 'initial-evaluate' and calls['evaluate'] == 1:
                raise RuntimeError('private evaluate detail')
            if fail_at == 'result-poll' and calls['evaluate'] == 2:
                raise RuntimeError('private poll detail')
            return {'started': True} if calls['evaluate'] == 1 else {'done': True, 'value': {'status': 200}}

        with patch.object(m.importlib.util, 'spec_from_file_location', return_value=SimpleNamespace(loader=loader)), \
             patch.object(m.importlib.util, 'module_from_spec', return_value=self.helper), \
             patch.object(m, 'operate', side_effect=operate), \
             patch.object(m, 'decode_output', side_effect=stop_parse_error or m.decode_output), \
             patch.object(m, 'evaluate', side_effect=evaluate), \
             patch.object(m, 'retire_restarted_sessions', side_effect=RuntimeError('private preflight detail') if fail_at == 'preflight' else None), \
             patch.object(sys, 'argv', ['helper', str(self.base), *flags]), \
             patch.object(sys, 'stdin', io.StringIO(json.dumps(self.payload))), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as result:
                m.cli()
        self.assertEqual(result.exception.code, 1)
        return stdout.getvalue(), stderr.getvalue()

    def test_check_does_not_create_page(self):
        self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(self.calls, [])

    def old_session(self):
        self.session.write_text(json.dumps({'safari_pid': '88', 'window_id': 123, 'snapshot': None}))
        self.session.chmod(0o600)
        self.helper.ensure_safari = lambda: '99'
        def release(path):
            if self.lock.exists() and self.lock.read_text() == str(path):
                self.lock.unlink()
        self.helper.release = release
        return self.session.read_bytes()

    def test_restarted_safari_dead_owner_is_archived_without_targeting_a_window(self):
        original = self.old_session()
        self.write_global_lock(str(self.session.resolve()))
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
            self.assertEqual(self.run_main('--check'), {'ready': True})
        saved = list((self.base / 'retired-safari-sessions').glob('*.json'))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_bytes(), original)
        self.assertEqual(saved[0].stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.lock.exists())
        self.assertFalse(self.session.exists())
        self.assertEqual(self.calls, [])

    def test_dead_owned_opening_is_reconciled_by_its_nonce(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        raw = json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'a' * 32})
        opening.write_text(raw); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        self.helper.ensure_safari = lambda: '99'
        self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        scripts = []
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: scripts.append(script) or 'closed'
        self.helper.release = lambda path, independent=False: own_lock.unlink()
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(scripts, ['about:blank#safari-owned-' + 'a' * 32])
        self.assertFalse(opening.exists())
        self.assertFalse(own_lock.exists())
        self.assertEqual(next((self.base / 'retired-safari-sessions').glob('*.json')).read_text(), raw)

    def test_legacy_opening_requires_and_releases_exact_global_owner_lock(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        raw = json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'f' * 32})
        opening.write_text(raw); opening.chmod(0o600)
        self.write_global_lock(str(self.session.resolve()))
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        self.helper.opening_cleanup_script = lambda nonce: nonce
        scripts = []
        self.helper.apple = lambda script: (
            '123, 456' if script.startswith('tell application "Safari" to get id of every window')
            else scripts.append(script) or 'closed'
        )
        self.helper.release = lambda path: self.lock.unlink()
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(scripts, ['about:blank#safari-owned-' + 'f' * 32])
        self.assertFalse(opening.exists())
        self.assertFalse(self.lock.exists())

    def assert_legacy_opening_lock_loss_blocks_nonce(self, replacement):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({
            'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'f' * 32,
        }))
        opening.chmod(0o600)
        self.write_global_lock(str(self.session.resolve()))
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        nonce_calls = []
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: nonce_calls.append(script) or 'closed'
        actual_sync = m.sync_directory
        def sync_and_replace(path):
            actual_sync(path)
            if path.resolve() == (self.base / 'retired-safari-sessions').resolve():
                if replacement is None:
                    self.lock.unlink()
                else:
                    self.write_global_lock(replacement)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError), \
             patch.object(m, 'sync_directory', side_effect=sync_and_replace):
            with self.assertRaisesRegex(RuntimeError, 'opening-global-owner-lost'):
                self.run_main('--check')
        self.assertEqual(nonce_calls, [])
        self.assertTrue(opening.exists())
        if replacement is not None:
            self.assertEqual(self.lock.read_text(), replacement)

    def test_legacy_opening_missing_global_owner_before_nonce_is_preserved(self):
        self.assert_legacy_opening_lock_loss_blocks_nonce(None)

    def test_legacy_opening_foreign_global_replacement_before_nonce_is_preserved(self):
        self.assert_legacy_opening_lock_loss_blocks_nonce(str(self.base / 'foreign.json'))

    def test_opening_without_own_or_global_lock_does_not_call_nonce(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'f' * 32}))
        opening.chmod(0o600)
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        scripts = []
        self.helper.apple = lambda script: scripts.append(script) or 'closed'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(scripts, [])
        self.assertTrue(opening.exists())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_live_or_ambiguous_opening_is_preserved(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'invalid'})); opening.chmod(0o600)
        self.helper.ensure_safari = lambda: '99'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):self.run_main('--check')
        self.assertTrue(opening.exists())

    def test_opening_cleanup_failure_keeps_retry_state(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'b' * 32})); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        self.helper.OPENING_CLEANUP_VERSION = 2
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: (_ for _ in []).throw(RuntimeError('ambiguous'))
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):self.run_main('--check')
        self.assertTrue(opening.exists())
        self.assertEqual(len(list((self.base/'retired-safari-sessions').glob('*.json'))), 1)

    def test_live_valid_opening_is_not_touched(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'b' * 32})); opening.chmod(0o600)
        self.helper.ensure_safari = lambda: '99'
        with patch.object(m.os, 'kill', return_value=None):
            with self.assertRaises(RuntimeError):self.run_main('--check')
        self.assertTrue(opening.exists())
        self.assertFalse((self.base/'retired-safari-sessions').exists())

    def test_old_cleanup_helper_preserves_opening(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'c' * 32})); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        self.helper.ensure_safari = lambda: '99'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaisesRegex(RuntimeError, 'upgrade-required'):self.run_main('--check')
        self.assertTrue(opening.exists())

    def test_absent_nonce_is_uncertain_and_preserved(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'c' * 32})); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: 'absent'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaisesRegex(RuntimeError, 'unresolved-opening'):self.run_main('--check')
        self.assertTrue(opening.exists())

    def test_same_safari_missing_owned_window_is_retired_without_closing(self):
        original = self.old_session()
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '88'
        scripts = []
        self.helper.apple = lambda script: scripts.append(script) or '456, 789'
        foreign = str(self.base / 'another-task.json')
        self.write_global_lock(foreign)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertFalse(self.session.exists())
        self.assertEqual(self.lock.read_text(), foreign)
        self.assertEqual(len(scripts), 1)
        self.assertNotIn('close', scripts[0])
        self.assertEqual(next((self.base/'retired-safari-sessions').glob('*.json')).read_bytes(), original)

    def test_unreadable_window_inventory_preserves_same_pid_session(self):
        self.old_session()
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '88'
        self.helper.apple = lambda script: 'unknown'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):self.run_main('--check')
        self.assertTrue(self.session.exists())

    def test_same_safari_or_live_owner_is_not_retired(self):
        original = self.old_session()
        self.helper.safari_pid = lambda: '88'
        self.helper.apple = lambda script: '123'
        for current, effect in [('88', ProcessLookupError), ('99', None)]:
            self.helper.ensure_safari = lambda: current
            with patch.object(m.os, 'kill', side_effect=effect):
                with self.assertRaises(RuntimeError):
                    self.run_main('--check')
            self.assertEqual(self.session.read_bytes(), original)

    def test_retirement_does_not_release_foreign_lock(self):
        self.old_session()
        foreign = str(self.base / 'another-task.json')
        self.write_global_lock(foreign)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(self.lock.read_text(), foreign)
        self.assertEqual(self.run_main(), {'status': 200})
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])

    def test_insecure_or_symlink_session_is_preserved(self):
        original = self.old_session()
        self.session.chmod(0o644)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        target = self.base / 'target.json'
        self.session.rename(target)
        target.chmod(0o600)
        self.session.symlink_to(target)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertTrue(self.session.is_symlink())
        self.assertEqual(target.read_bytes(), original)

    def test_failed_lock_release_keeps_original_and_reuses_saved_copy(self):
        original = self.old_session()
        self.write_global_lock(str(self.session.resolve()))
        self.helper.release = lambda _path: (_ for _ in ()).throw(OSError('denied'))
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            for _ in range(2):
                with self.assertRaises(OSError):
                    self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertEqual(len(list((self.base / 'retired-safari-sessions').glob('*.json'))), 1)
        self.assertEqual(self.lock.read_text(), str(self.session.resolve()))

    def test_damaged_global_lock_fails_before_archiving_stale_session(self):
        original = self.old_session()
        self.lock.write_text('')
        self.lock.chmod(0o600)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_malformed_global_lock_fails_closed_before_archiving(self):
        original = self.old_session()
        for content in (b'relative/path', b'\xff', b'/' + b'a' * 4096):
            with self.subTest(content_length=len(content)):
                self.lock.write_bytes(content)
                self.lock.chmod(0o600)
                with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
                    with self.assertRaises(RuntimeError):
                        self.run_main('--check')
                self.assertEqual(self.session.read_bytes(), original)
                self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_symlink_global_lock_fails_before_archiving_stale_session(self):
        original = self.old_session()
        target = self.base / 'target-lock'
        target.write_text(str(self.session))
        target.chmod(0o600)
        self.lock.symlink_to(target)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertTrue(self.lock.is_symlink())
        self.assertEqual(target.read_text(), str(self.session))
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_fifo_global_lock_fails_without_blocking_or_archiving(self):
        original = self.old_session()
        os.mkfifo(self.lock, 0o600)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertTrue(self.lock.is_fifo())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_stale_normal_with_fifo_own_lock_fails_before_archive(self):
        original = self.old_session()
        state = json.loads(original)
        state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state)); self.session.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        os.mkfifo(own_lock, 0o600)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertTrue(self.session.exists())
        self.assertTrue(own_lock.is_fifo())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_stale_window_session_without_own_lock_fails_before_archive(self):
        original = self.old_session()
        state = json.loads(original); state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state)); self.session.chmod(0o600)
        expected = self.session.read_bytes()
        released = []
        self.helper.release = lambda *args: released.append(args)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), expected)
        self.assertEqual(released, [])
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_alias_own_lock_fails_before_stale_normal_archive(self):
        original = self.old_session()
        state = json.loads(original); state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state)); self.session.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve().parent) + '/./' + self.session.name)
        own_lock.chmod(0o600)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertTrue(self.session.exists())
        self.assertTrue(own_lock.exists())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_newline_own_lock_fails_before_opening_nonce(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        raw = json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'e' * 32})
        opening.write_text(raw); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve()) + '\n'); own_lock.chmod(0o600)
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        scripts = []
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: scripts.append(script) or 'closed'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(scripts, [])
        self.assertEqual(opening.read_text(), raw)
        self.assertTrue(own_lock.exists())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_noop_own_lock_release_preserves_stale_session(self):
        original = self.old_session()
        state = json.loads(original); state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state)); self.session.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        self.helper.release = lambda *_args: None
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaisesRegex(RuntimeError, 'own-lock-release-unconfirmed'):
                self.run_main('--check')
        self.assertTrue(self.session.exists())
        self.assertTrue(own_lock.exists())

    def test_noop_global_lock_release_preserves_stale_session(self):
        original = self.old_session()
        self.write_global_lock(str(self.session.resolve()))
        self.helper.release = lambda *_args: None
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaisesRegex(RuntimeError, 'global-lock-release-unconfirmed'):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertEqual(self.lock.read_text(), str(self.session.resolve()))

    def test_foreign_global_turnover_during_archive_preserves_foreign_lock(self):
        original = self.old_session()
        foreign = str(self.base / 'foreign.json')
        self.write_global_lock(foreign)
        actual_sync = m.sync_directory
        changed = str(self.base / 'replacement.json')
        def sync_and_change(path):
            actual_sync(path)
            if path.resolve() == (self.base / 'retired-safari-sessions').resolve():
                self.write_global_lock(changed)
        released = []
        self.helper.release = lambda *args: released.append(args)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError), \
             patch.object(m, 'sync_directory', side_effect=sync_and_change):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertFalse(self.session.exists())
        self.assertEqual(self.lock.read_text(), changed)
        self.assertEqual(released, [])
        saved = list((self.base / 'retired-safari-sessions').glob('*.json'))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_bytes(), original)

    def test_foreign_global_turnover_after_own_release_is_preserved(self):
        original = self.old_session()
        state = json.loads(original); state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state)); self.session.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        first = str(self.base / 'foreign-a.json')
        second = str(self.base / 'foreign-b.json')
        self.write_global_lock(first)
        def release(path, independent=False):
            self.assertTrue(independent)
            own_lock.unlink()
            self.write_global_lock(second)
        self.helper.release = release
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertFalse(self.session.exists())
        self.assertFalse(own_lock.exists())
        self.assertEqual(self.lock.read_text(), second)

    def test_new_global_lock_for_session_is_not_mistaken_for_initial_owner(self):
        original = self.old_session()
        foreign = str(self.base / 'foreign.json')
        self.write_global_lock(foreign)
        own_value = str(self.session.resolve())
        def acquire_during_scan(_pid, _signal):
            self.write_global_lock(own_value)
            raise ProcessLookupError
        with patch.object(m.os, 'kill', side_effect=acquire_during_scan):
            with self.assertRaisesRegex(RuntimeError, 'lock-changed-before-archive'):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertEqual(self.lock.read_text(), own_value)
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_stale_opening_with_unsafe_own_lock_fails_before_nonce_or_archive(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        raw = json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'd' * 32})
        opening.write_text(raw); opening.chmod(0o600)
        own_lock = self.session.with_name(self.session.name + '.lock')
        target = self.base / 'other-lock'
        target.write_text(str(self.session)); target.chmod(0o600)
        own_lock.symlink_to(target)
        self.helper.ensure_safari = self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        scripts = []
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: scripts.append(script) or 'closed'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaises(RuntimeError):
                self.run_main('--check')
        self.assertEqual(scripts, [])
        self.assertEqual(opening.read_text(), raw)
        self.assertTrue(own_lock.is_symlink())
        self.assertFalse((self.base / 'retired-safari-sessions').exists())

    def test_failed_archive_write_removes_temporary_copy(self):
        original = self.old_session()
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError), \
             patch.object(m.os, 'fsync', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertEqual(list((self.base / 'retired-safari-sessions').iterdir()), [])

    def test_retirement_is_serial_and_safe_to_retry(self):
        self.old_session()
        fd = os.open(self.base / '.safari-retire.lock', os.O_RDWR | os.O_CREAT, 0o600)
        try:
            m.fcntl.flock(fd, m.fcntl.LOCK_EX | m.fcntl.LOCK_NB)
            with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
                with self.assertRaises(RuntimeError):
                    self.run_main('--check')
            self.assertTrue(self.session.exists())
        finally:
            os.close(fd)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})

    def test_archive_directory_sync_failure_preserves_hot_state(self):
        original = self.old_session()
        self.write_global_lock(str(self.session.resolve()))
        actual = os.fsync
        def fail_directory(fd):
            if m.stat.S_ISDIR(os.fstat(fd).st_mode):
                raise OSError('directory commit failed')
            return actual(fd)
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError), \
             patch.object(m.os, 'fsync', side_effect=fail_directory):
            with self.assertRaises(OSError):
                self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertTrue(self.lock.exists())

    def test_unresolved_session_is_preserved(self):
        self.session.write_text('{}')
        with self.assertRaises(RuntimeError):
            self.run_main('--check')
        with self.assertRaises(RuntimeError):
            self.run_main()
        self.assertEqual(self.calls, [])
        self.assertTrue(self.session.exists())

    def test_lock_only_partial_start_cannot_report_ready(self):
        self.write_global_lock(str(self.session.resolve()))
        with self.assertRaises(RuntimeError):
            self.run_main('--check')
        self.assertEqual(self.calls, [])
        self.assertTrue(self.lock.exists())

    def test_foreign_lock_does_not_block_independent_window(self):
        foreign = str(self.base / 'another-task.json')
        self.write_global_lock(foreign)
        self.assertEqual(self.run_main(), {'status': 200})
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])
        self.assertEqual(self.lock.read_text(), foreign)

    def test_stage_diagnostics_are_fixed_and_do_not_expose_exception_data(self):
        expected = {
            'preflight': 'stage=preflight cleanup=not-attempted',
            'start': 'stage=start cleanup=not-attempted',
            'navigate': 'stage=navigate cleanup=failed detail=stop-unknown',
            'initial-evaluate': 'stage=initial-evaluate cleanup=success',
            'result-poll': 'stage=result-poll cleanup=success',
        }
        for stage, diagnostic in expected.items():
            with self.subTest(stage=stage):
                stdout, stderr = self.run_cli_failure(stage, stop_fails=(stage == 'navigate'))
                self.assertEqual(stdout, '')
                self.assertEqual(stderr.strip(), 'Safari relay diagnostic ' + diagnostic)
                self.assertNotIn('private', stderr)
                self.assertNotIn('cookie', stderr)
                self.assertNotIn('https://', stderr)

    def test_stop_failure_does_not_replace_primary_stage_and_preserves_session(self):
        stdout, stderr = self.run_cli_failure('navigate', stop_error=TimeoutError('secret timeout'))
        self.assertEqual(stdout, '')
        self.assertEqual(
            stderr.strip(),
            'Safari relay diagnostic stage=navigate cleanup=failed detail=stop-timeout',
        )
        self.assertTrue(self.session.exists())

    def test_stop_only_failures_use_fixed_subtypes_without_exposing_details(self):
        cases = (
            (subprocess.TimeoutExpired('private command', 30), 'stop-timeout'),
            (TimeoutError('private timeout URL'), 'stop-timeout'),
            (OSError('private path cookie'), 'stop-os-error'),
            (RuntimeError('private unknown body'), 'stop-unknown'),
        )
        for error, cleanup in cases:
            with self.subTest(cleanup=cleanup):
                stdout, stderr = self.run_cli_failure(None, stop_error=error)
                self.assertEqual(stdout, '')
                self.assertEqual(
                    stderr.strip(),
                    f'Safari relay diagnostic stage=stop cleanup=failed detail={cleanup}',
                )
                self.assertNotRegex(stderr, r'private|URL|cookie|body|path')

    def test_stop_output_decode_failure_is_separate_from_invocation_failure(self):
        stdout, stderr = self.run_cli_failure(None, stop_output='not-json secret URL')
        self.assertEqual(stdout, '')
        self.assertEqual(
            stderr.strip(),
            'Safari relay diagnostic stage=stop cleanup=failed detail=stop-output-decode-error',
        )
        self.assertNotRegex(stderr, r'secret|URL|not-json')

    def test_stop_decode_exception_does_not_replace_primary_failure(self):
        stdout, stderr = self.run_cli_failure(
            'navigate', stop_parse_error=RecursionError('private recursive payload'),
        )
        self.assertEqual(stdout, '')
        self.assertEqual(
            stderr.strip(),
            'Safari relay diagnostic stage=navigate cleanup=failed detail=stop-output-decode-error',
        )
        self.assertNotRegex(stderr, r'private|recursive|payload')

    def test_check_failure_is_a_preflight_diagnostic_without_window_operations(self):
        stdout, stderr = self.run_cli_failure('preflight', flags=('--check',))
        self.assertEqual(stdout, '')
        self.assertEqual(stderr.strip(), 'Safari relay diagnostic stage=preflight cleanup=not-attempted')
        self.assertEqual(self.calls, [])

    def test_preflight_failure_preserves_an_existing_session_without_stopping_it(self):
        self.session.write_text('another-owner')
        stdout, stderr = self.run_cli_failure(
            'preflight', flags=('--check',), preserve_session=True,
        )
        self.assertEqual(stdout, '')
        self.assertEqual(stderr.strip(), 'Safari relay diagnostic stage=preflight cleanup=not-attempted')
        self.assertEqual(self.session.read_text(), 'another-owner')
        self.assertEqual(self.calls, [])

    def test_sigterm_interrupt_stops_only_the_owned_window_and_keeps_diagnostic_stage(self):
        stdout, stderr = self.run_cli_failure(None, interrupt_at=1)
        self.assertEqual(stdout, '')
        self.assertEqual(stderr.strip(), 'Safari relay diagnostic stage=initial-evaluate cleanup=success')
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])
        self.assertFalse(self.session.exists())

    def test_failed_acquisition_preserves_winners_session(self):
        foreign = self.base / 'safari-session.json'
        def lose_lock(_helper, _session, command, *_args):
            self.calls.append(command)
            if command == 'start':
                foreign.write_text('{}')
                raise RuntimeError('another task acquired lock')
            if command == 'stop':
                foreign.unlink()
        self.operate = lose_lock
        with self.assertRaises(RuntimeError):
            self.run_main()
        self.assertEqual(self.calls, ['start'])
        self.assertTrue(foreign.exists())

    def test_independent_partial_start_remains_unresolved(self):
        lock = self.session.with_name(self.session.name + '.lock')
        lock.write_text(str(self.session.resolve())); lock.chmod(0o600)
        with self.assertRaises(RuntimeError):
            self.run_main('--check')
        self.assertTrue(lock.exists())

    def test_restart_returns_only_its_independent_slot(self):
        self.old_session()
        state = json.loads(self.session.read_text())
        state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state))
        own_lock = self.session.with_name(self.session.name + '.lock')
        own_lock.write_text(str(self.session.resolve())); own_lock.chmod(0o600)
        foreign = str(self.base / 'another-task.json')
        self.write_global_lock(foreign)
        released = []
        def release(path, independent=False):
            released.append((path, independent))
            if independent:
                own_lock.unlink()
        self.helper.release = release
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(released, [(self.session.resolve(), True)])
        self.assertEqual(self.lock.read_text(), foreign)

    def test_success_returns_window(self):
        signals = []
        with patch.object(m.signal, 'signal', side_effect=lambda *args: signals.append(args)):
            self.assertEqual(self.run_main(), {'status': 200})
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])
        self.assertEqual(signals, [(signal.SIGTERM, m.interrupt), (signal.SIGTERM, signal.SIG_IGN)])
        self.assertFalse(self.session.exists())

    def test_context_loss_returns_window(self):
        with self.assertRaisesRegex(RuntimeError, 'context-lost'):
            self.run_main(values=[{}, {'lost': True}])
        self.assertEqual(self.calls[-1], 'stop')

    def test_polling_waits_for_done(self):
        with patch.object(m.time, 'sleep'):
            self.assertEqual(self.run_main(values=[{}, {'done': False}, {'done': True, 'value': {}}]), {})

    def test_invalid_path_never_starts(self):
        self.payload['args']['path'] = 'https://attacker.invalid'
        with self.assertRaises(ValueError):
            self.run_main()
        self.assertEqual(self.calls, [])

    def test_timeout_closes_owned_window(self):
        with patch.object(m.time, 'monotonic', side_effect=[0, 20]):
            with self.assertRaises(TimeoutError):
                self.run_main()
        self.assertEqual(self.calls[-1], 'stop')

    def test_signal_interrupt_is_not_ignored_during_fetch(self):
        with self.assertRaises(TimeoutError):
            m.interrupt(None, None)

    def test_operate_restores_argv_on_failure(self):
        previous = sys.argv
        with self.assertRaises(ValueError):
            m.operate(SimpleNamespace(main=lambda: (_ for _ in []).throw(ValueError())), self.session, 'start')
        self.assertIs(sys.argv, previous)


if __name__ == '__main__':
    unittest.main()
