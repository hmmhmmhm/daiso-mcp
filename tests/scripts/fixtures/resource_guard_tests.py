"""자원 보호의 한도·잠금·소유 프로세스 종료 회귀."""
import importlib.util
from pathlib import Path
from contextlib import nullcontext
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('resource_guard', ROOT / 'scripts/ops/resource-guard.py')
guard = importlib.util.module_from_spec(SPEC)


class GuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        SPEC.loader.exec_module(guard)

    def setUp(self):
        silent = patch.object(guard, 'emit')
        silent.start()
        self.addCleanup(silent.stop)

    def test_start_and_runtime_thresholds(self):
        self.assertIsNone(guard.reason({'freePercent': 40, 'cpuPercent': 10, 'browsers': 1}, True))
        self.assertEqual(guard.reason({'freePercent': 19, 'cpuPercent': 10, 'browsers': 1}, True), 'memory')
        self.assertEqual(guard.reason({'freePercent': 11, 'cpuPercent': 10, 'browsers': 1}), 'memory')
        self.assertIsNone(guard.reason({'freePercent': 19, 'cpuPercent': 10, 'browsers': 1}))
        self.assertEqual(guard.reason({'freePercent': 40, 'cpuPercent': 91, 'browsers': 1}), 'cpu')
        self.assertEqual(guard.reason({'freePercent': 40, 'cpuPercent': 10, 'browsers': 3}), 'browsers')

    def test_chrome_helpers_do_not_count_as_browsers(self):
        rows = ' 10 1 50 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n 2 10 50 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper\n 3 1 0 /tmp/chrome-headless-shell\n 4 1 0 /tmp/Google Chrome for Testing\n 5 4 0 /tmp/chrome\n 6 5 0 /tmp/chrome\n'
        self.assertEqual(guard.parse_processes(rows, 4), (25, 3))

    def test_missing_or_malformed_measurement_fails_closed(self):
        with self.assertRaises(ValueError):
            guard.parse_processes('broken', 4)
        with self.assertRaises(ValueError):
            guard.parse_memory('not a measurement')
        self.assertEqual(guard.parse_memory('System-wide memory free percentage: 42%'), 42)

    def test_only_one_guard_can_hold_lock(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'lock'
            with guard.lease(path):
                child = subprocess.run([sys.executable, '-c',
                    "import runpy,sys; g=runpy.run_path(sys.argv[1]); c=g['lease'](sys.argv[2]); c.__enter__()",
                    str(ROOT / 'scripts/ops/resource-guard.py'), str(path)], capture_output=True)
                self.assertNotEqual(child.returncode, 0)
                self.assertIn(b'BlockingIOError', child.stderr)
            with guard.lease(path):
                pass

    def test_observation_failure_and_pressure_stop_owned_child(self):
        for snapshot in [lambda: (_ for _ in ()).throw(ValueError('probe failed')),
                         lambda: {'freePercent': 5, 'cpuPercent': 0, 'browsers': 0}]:
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
            self.assertEqual(guard.watch(child, snapshot, interval=0.01), 75)
            self.assertIsNotNone(child.poll())

    def test_success_keeps_exit_code(self):
        child = subprocess.Popen([sys.executable, '-c', 'raise SystemExit(7)'], start_new_session=True)
        self.assertEqual(guard.watch(child, lambda: {'freePercent': 50, 'cpuPercent': 0, 'browsers': 0}, interval=0.01), 7)

    def test_refusal_does_not_start_command(self):
        with patch.object(guard, 'snapshot', return_value={'freePercent': 5, 'cpuPercent': 0, 'browsers': 0}), \
                patch.object(guard, 'lease', return_value=nullcontext()), \
                patch.object(guard.subprocess, 'Popen') as spawn:
            self.assertEqual(guard.main(['--', 'never-run']), 75)
            spawn.assert_not_called()

    def test_browser_limit_and_sustained_cpu_stop_child(self):
        for value, expected in [({'freePercent': 50, 'cpuPercent': 0, 'browsers': 3}, 3),
                                ({'freePercent': 50, 'cpuPercent': 95, 'browsers': 0}, 15)]:
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
            calls = []
            def probe():
                calls.append(True)
                return value
            self.assertEqual(guard.watch(child, probe, interval=0.001), 75)
            self.assertEqual(len(calls), expected)

    def test_symlink_lock_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / 'target'
            target.write_text('preserve')
            link = Path(d) / 'link'
            link.symlink_to(target)
            with self.assertRaises(OSError):
                with guard.lease(link):
                    self.fail('symlink accepted')
            self.assertEqual(target.read_text(), 'preserve')

    def test_changing_memory_reason_does_not_reset_browser_streak(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
        values = iter([{'freePercent': free, 'cpuPercent': 0, 'browsers': 3} for free in [11, 13, 11]])
        self.assertEqual(guard.watch(child, lambda: next(values), interval=0.001), 75)
        guard.emit.assert_any_call('stopped', reason='browsers', freePercent=11, cpuPercent=0, browsers=3)

    def test_interruption_reaps_child(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
        with self.assertRaises(KeyboardInterrupt):
            guard.watch(child, lambda: (_ for _ in ()).throw(KeyboardInterrupt()), interval=0.001)
        self.assertIsNotNone(child.poll())

    def test_normal_exit_reaps_remaining_owned_descendant(self):
        with tempfile.TemporaryDirectory() as d:
            pidfile = Path(d) / 'child.pid'
            script = "import subprocess,sys; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); open(sys.argv[1],'w').write(str(p.pid))"
            child = subprocess.Popen([sys.executable, '-c', script, str(pidfile)], start_new_session=True)
            self.assertEqual(guard.watch(child, lambda: {'freePercent': 50, 'cpuPercent': 0, 'browsers': 0}, interval=0.01), 0)
            pid = int(pidfile.read_text())
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True)
            self.assertTrue(result.returncode != 0 or result.stdout.strip().startswith('Z'))


if __name__ == '__main__':
    unittest.main()
