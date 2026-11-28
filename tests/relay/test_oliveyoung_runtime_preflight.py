"""실제 LaunchAgent나 runtime 없이 OY 경로 preflight를 합성 fixture로 검증합니다."""
import contextlib
import importlib.util
import io
import os
import plistlib
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / 'scripts/relay/verify-oliveyoung-runtime.py'
SPEC = importlib.util.spec_from_file_location('oy_runtime_preflight', SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class OliveyoungRuntimePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'checkout'
        self.runtime = self.root / 'runtime'
        self.plist = self.root / 'page.aka.daiso-oliveyoung.plist'
        self.source.mkdir()
        self.runtime.mkdir()
        self.expected_files = (
            ('scripts', 'relay', 'oliveyoung-safari.py'),
            ('scripts', 'relay', 'safari-lifecycle.ts'),
        )
        for relative in self.expected_files:
            for root in (self.source, self.runtime):
                path = root.joinpath(*relative)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(('fixture:' + relative[-1]).encode())
        entrypoint = self.runtime / 'scripts/relay/start.ts'
        entrypoint.parent.mkdir(parents=True, exist_ok=True)
        entrypoint.write_text('fixture entrypoint')
        self.agent = {
            'Label': MODULE.LABEL,
            'WorkingDirectory': str(self.runtime),
            'ProgramArguments': [
                '/opt/homebrew/bin/node',
                '--max-old-space-size=256',
                '--env-file=/private/runtime/relay.env',
                '--import',
                'tsx',
                str(entrypoint),
            ],
            'EnvironmentVariables': {'OY_RELAY_TOKEN': 'PRIVATE_TOKEN_SENTINEL'},
        }
        self.write_plist()

    def tearDown(self):
        self.temp.cleanup()

    def write_plist(self, agent=None):
        self.plist.write_bytes(plistlib.dumps(self.agent if agent is None else agent))

    def verify(self, phase='plan', runtime=None):
        return MODULE.verify(
            phase,
            str(self.plist),
            str(self.runtime if runtime is None else runtime),
            str(self.source),
        )

    def test_valid_runtime_link_and_matching_files(self):
        self.assertEqual(self.verify('plan'), 'target-ready')
        self.assertEqual(self.verify('exact'), 'files-match')

    def test_plan_checks_target_safety_without_claiming_content_match(self):
        target = self.runtime / 'scripts/relay/oliveyoung-safari.py'
        target.write_text('old but regular file')
        self.assertEqual(self.verify('plan'), 'target-ready')
        self.assertEqual(self.verify('exact'), 'reject:file-mismatch')

    def test_runtime_candidate_must_match_plist_working_directory(self):
        other = self.root / 'dtryx-runtime'
        other.mkdir()
        self.assertEqual(self.verify('plan', runtime=other), 'reject:runtime-mismatch')

    def test_node_entrypoint_must_be_exactly_inside_that_runtime(self):
        other = self.root / 'dtryx-runtime/scripts/relay/start.ts'
        changed = dict(self.agent)
        changed['ProgramArguments'] = list(self.agent['ProgramArguments'])
        changed['ProgramArguments'][-1] = str(other)
        self.write_plist(changed)
        self.assertEqual(self.verify(), 'reject:entrypoint-mismatch')

    def test_wrong_label_is_rejected(self):
        changed = dict(self.agent)
        changed['Label'] = 'page.aka.daiso-dtryx'
        self.write_plist(changed)
        self.assertEqual(self.verify(), 'reject:label-mismatch')

    def test_program_override_is_rejected_even_with_valid_arguments(self):
        changed = dict(self.agent)
        changed['Program'] = '/opt/homebrew/bin/node'
        self.write_plist(changed)
        self.assertEqual(self.verify(), 'reject:program-override')

    def test_eval_and_separator_arguments_are_not_treated_as_the_node_entrypoint(self):
        for unsafe in ('--eval', '--'):
            with self.subTest(argument=unsafe):
                changed = dict(self.agent)
                changed['ProgramArguments'] = list(self.agent['ProgramArguments'])
                changed['ProgramArguments'].append(unsafe)
                self.write_plist(changed)
                self.assertEqual(self.verify(), 'reject:program-arguments-invalid')

    def test_symlink_runtime_source_is_rejected(self):
        target = self.runtime / 'scripts/relay/safari-lifecycle.ts'
        target.unlink()
        target.symlink_to(self.source / 'scripts/relay/safari-lifecycle.ts')
        self.assertEqual(self.verify(), 'reject:runtime-file-invalid')

    def test_nonregular_runtime_target_is_rejected_without_reading_a_fifo(self):
        target = self.runtime / 'scripts/relay/oliveyoung-safari.py'
        target.unlink()
        os.mkfifo(target)
        self.assertEqual(self.verify(), 'reject:runtime-file-invalid')

    def test_fixed_output_does_not_disclose_paths_or_environment_values(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = MODULE.main(['plan', str(self.plist), str(self.runtime), str(self.source)])
        self.assertEqual(code, 0)
        self.assertEqual(output.getvalue(), 'oy-runtime-preflight=target-ready\n')
        self.assertNotIn(str(self.root), output.getvalue())
        self.assertNotIn('PRIVATE_TOKEN_SENTINEL', output.getvalue())
        self.assertNotIn('/private/runtime/relay.env', output.getvalue())

    def test_bad_arity_and_phase_have_fixed_rejections(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            bad_arity = MODULE.main(['plan', str(self.plist)])
        self.assertEqual((bad_arity, output.getvalue()),
                         (2, 'oy-runtime-preflight=reject:arguments-invalid\n'))
        self.assertEqual(self.verify('install'), 'reject:phase-invalid')


if __name__ == '__main__':
    unittest.main()
