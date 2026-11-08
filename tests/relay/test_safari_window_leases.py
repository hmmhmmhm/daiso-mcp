"""개별 Safari 작업의 슬롯·자원·생성 임계 구간 계약."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('leases', Path(__file__).resolve().parents[2] / 'scripts/relay/safari_window_leases.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.pressure = patch.object(m, 'check_resources')
        self.pressure.start()
    def tearDown(self):
        self.pressure.stop()
        self.temp.cleanup()
    def test_four_independent_sessions_and_owned_release(self):
        sessions = [self.root / f'{i}.json' for i in range(5)]
        for p in sessions[:4]: m.reserve(self.root, p)
        with self.assertRaisesRegex(RuntimeError, 'capacity'): m.reserve(self.root, sessions[4])
        m.release(self.root, sessions[0])
        m.reserve(self.root, sessions[4])
        self.assertEqual(len(list((self.root/'window-slots').glob('*.json'))), 4)
        m.release(self.root, sessions[0])
        self.assertEqual(len(list((self.root/'window-slots').glob('*.json'))), 4)
    def test_legacy_global_counts_but_is_never_removed(self):
        lock = self.root / 'work-session.lock'; lock.write_text('another-task')
        for i in range(3): m.reserve(self.root, self.root/f'{i}.json')
        with self.assertRaisesRegex(RuntimeError, 'capacity'): m.reserve(self.root, self.root/'4.json')
        self.assertEqual(lock.read_text(), 'another-task')
    def test_resource_refusal_does_not_reserve_slot(self):
        with patch.object(m, 'check_resources', side_effect=RuntimeError('memory')):
            with self.assertRaises(RuntimeError): m.reserve(self.root, self.root/'x.json')
        self.assertEqual(list((self.root/'window-slots').glob('*.json')), [])
    def test_same_session_cannot_reserve_twice(self):
        p=self.root/'x.json'; m.reserve(self.root,p)
        with self.assertRaisesRegex(RuntimeError,'already'):m.reserve(self.root,p)
    def test_slot_directory_symlink_is_refused(self):
        other=self.root/'other';other.mkdir();(self.root/'window-slots').symlink_to(other)
        with self.assertRaises(RuntimeError):m.reserve(self.root,self.root/'x.json')
    def test_gate_is_released_after_exception(self):
        with self.assertRaises(ValueError):
            with m.gate(self.root):raise ValueError()
        with m.gate(self.root):pass
    def test_pressure_checks_fail_closed(self):
        self.pressure.stop()
        with patch.object(m.subprocess,'check_output',return_value='unknown'):
            with self.assertRaises(RuntimeError):m.check_resources()
        self.pressure.start()

if __name__ == '__main__':unittest.main()
