"""외부 네트워크 없이 고정 HTTP 헬퍼 계약을 검증합니다."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/relay/oliveyoung-http.py'

class HelperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('oy_http', SCRIPT)
        cls.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.helper)

    def request(self, raw=b'{"status":"SUCCESS","data":{}}', status=200):
        response = io.BytesIO(raw)
        response.status = status
        opener = unittest.mock.Mock()
        opener.open.return_value = response
        return opener

    def test_success_and_fixed_headers(self):
        for path in self.helper.PATHS:
            opener = self.request()
            with patch.object(self.helper.urllib.request, 'build_opener', return_value=opener):
                self.assertEqual(self.helper.fetch(path, {}), {'status': 'SUCCESS', 'data': {}})
            request = opener.open.call_args.args[0]
            self.assertEqual(request.full_url, 'https://www.oliveyoung.co.kr' + path)
            self.assertEqual(request.method, 'POST')
            self.assertEqual(opener.open.call_args.kwargs['timeout'], 15)
            self.assertNotIn('Cookie', request.headers)
            self.assertEqual(request.get_header('Origin'), 'https://www.oliveyoung.co.kr')
            self.assertEqual(request.get_header('X-requested-with'), 'XMLHttpRequest')

    def test_failures(self):
        cases = [(b'private body', 403), (b'private body', 302), (b'bad', 200),
                 (b'[]', 200), (b'{"status":"ERROR","data":{}}', 200),
                 (b'{"status":"SUCCESS","data":[]}', 200),
                 (b'{"status":"SUCCESS"}', 200), (b'x' * (self.helper.LIMIT + 1), 200)]
        for raw, status in cases:
            with self.subTest(status=status, size=len(raw)):
                with patch.object(self.helper.urllib.request, 'build_opener', return_value=self.request(raw, status)):
                    with self.assertRaises(self.helper.RelayError):
                        self.helper.fetch(next(iter(self.helper.PATHS)), {})

    def test_invalid_path_body_and_no_redirects(self):
        with patch.object(self.helper.urllib.request, 'build_opener') as build:
            for path in ['https://evil.test', '/oystore/api/stock/stock-stores?x=1', '//evil.test']:
                with self.assertRaises(self.helper.RelayError): self.helper.fetch(path, {})
            with self.assertRaises(self.helper.RelayError): self.helper.fetch(next(iter(self.helper.PATHS)), [])
            build.assert_not_called()
        handler = self.helper.NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, '', {}, 'https://www.oliveyoung.co.kr/'))

    def test_http_error_and_timeout_are_sanitized(self):
        for error in [HTTPError('secret', 403, 'private', {}, io.BytesIO(b'secret')), TimeoutError('private')]:
            opener = self.request()
            opener.open.side_effect = error
            with patch.object(self.helper.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(self.helper.RelayError, '^Upstream unavailable$'):
                    self.helper.fetch(next(iter(self.helper.PATHS)), {})

    def test_main_check_invalid_and_large_input(self):
        with patch.object(self.helper.sys, 'argv', ['helper', '--check']), patch.object(self.helper.sys, 'stdout', new=io.StringIO()) as output:
            self.assertEqual(self.helper.main(), 0)
            self.assertEqual(json.loads(output.getvalue()), {'ready': True})
        for data in [b'x', b'[]', b'{}', b'x' * (self.helper.LIMIT + 1)]:
            stdin = unittest.mock.Mock(buffer=io.BytesIO(data))
            with patch.object(self.helper.sys, 'argv', ['helper']), patch.object(self.helper.sys, 'stdin', stdin), patch.object(self.helper.sys, 'stderr', new=io.StringIO()) as output:
                self.assertEqual(self.helper.main(), 1)
                self.assertEqual(output.getvalue(), 'HTTP relay request failed\n')

if __name__ == '__main__': unittest.main()
