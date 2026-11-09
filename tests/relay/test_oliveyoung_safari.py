"""실제 Safari를 열지 않는 소유 창 회수 회귀입니다."""
import contextlib
import importlib.util
import io
import json
import os
import signal
import sys
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

    def operate(self, _helper, _session, command, *_args):
        self.calls.append(command)
        if command == 'start':
            self.assertIn('--independent-window', _args)
            self.session.write_text('{}')
        if command == 'stop':
            self.session.unlink()
        return {'ok': True}

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
        self.lock.write_text(str(self.session))
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
        self.helper.ensure_safari = lambda: '99'
        self.helper.safari_pid = lambda: '99'
        self.helper.OPENING_CLEANUP_VERSION = 2
        scripts = []
        self.helper.opening_cleanup_script = lambda nonce: nonce
        self.helper.apple = lambda script: scripts.append(script) or 'closed'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(scripts, ['about:blank#safari-owned-' + 'a' * 32])
        self.assertFalse(opening.exists())
        self.assertEqual(next((self.base / 'retired-safari-sessions').glob('*.json')).read_text(), raw)

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
        self.helper.ensure_safari = lambda: '99'
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            with self.assertRaisesRegex(RuntimeError, 'upgrade-required'):self.run_main('--check')
        self.assertTrue(opening.exists())

    def test_absent_nonce_is_uncertain_and_preserved(self):
        opening = self.session.with_name(self.session.name + '.opening.json')
        opening.write_text(json.dumps({'safari_pid': '99', 'nonce': 'about:blank#safari-owned-' + 'c' * 32})); opening.chmod(0o600)
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
        self.lock.write_text('another-task')
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertFalse(self.session.exists())
        self.assertEqual(self.lock.read_text(), 'another-task')
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
        self.lock.write_text('another-task')
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(self.lock.read_text(), 'another-task')
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
        self.lock.write_text(str(self.session))
        self.helper.release = lambda _path: (_ for _ in ()).throw(OSError('denied'))
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            for _ in range(2):
                with self.assertRaises(OSError):
                    self.run_main('--check')
        self.assertEqual(self.session.read_bytes(), original)
        self.assertEqual(len(list((self.base / 'retired-safari-sessions').glob('*.json'))), 1)
        self.assertEqual(self.lock.read_text(), str(self.session))

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
        self.lock.write_text(str(self.session))
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
        self.lock.write_text(str(self.session))
        with self.assertRaises(RuntimeError):
            self.run_main('--check')
        self.assertEqual(self.calls, [])
        self.assertTrue(self.lock.exists())

    def test_foreign_lock_does_not_block_independent_window(self):
        self.lock.write_text('another-task')
        self.assertEqual(self.run_main(), {'status': 200})
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])
        self.assertEqual(self.lock.read_text(), 'another-task')

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
        lock.write_text(str(self.session))
        with self.assertRaises(RuntimeError):
            self.run_main('--check')
        self.assertTrue(lock.exists())

    def test_restart_returns_only_its_independent_slot(self):
        self.old_session()
        state = json.loads(self.session.read_text())
        state['lock_scope'] = 'window'
        self.session.write_text(json.dumps(state))
        self.lock.write_text('another-task')
        released = []
        self.helper.release = lambda path, independent=False: released.append((path, independent))
        with patch.object(m.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(self.run_main('--check'), {'ready': True})
        self.assertEqual(released, [(self.session.resolve(), True)])
        self.assertEqual(self.lock.read_text(), 'another-task')

    def test_success_returns_window(self):
        self.assertEqual(self.run_main(), {'status': 200})
        self.assertEqual(self.calls, ['start', 'navigate', 'stop'])
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
