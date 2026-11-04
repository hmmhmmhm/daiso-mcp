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

    def test_foreign_lock_does_not_open_window(self):
        self.lock.write_text('another-task')
        self.assertEqual(self.run_main(), {'relayError': 'safari-busy'})
        self.assertEqual(self.calls, [])
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
