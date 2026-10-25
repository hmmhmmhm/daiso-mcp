import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ops', 'scripts/relay/macos-ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

class OpsTests(unittest.TestCase):
    def test_private_files_and_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root).resolve() / 'env'
            path.write_text('OY_RELAY_TOKEN="secret"\nOTHER=x\nOPTIONAL=\nCOMMENTED= # unset\n')
            path.chmod(0o600)
            self.assertEqual(ops.read_env(path)['OY_RELAY_TOKEN'], 'secret')
            self.assertEqual(ops.read_env(path)['OPTIONAL'], '')
            self.assertEqual(ops.read_env(path)['COMMENTED'], '')
            link = Path(root).resolve() / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError): ops.read_env(link)
            path.chmod(0o644)
            with self.assertRaises(ValueError): ops.read_env(path)

    def test_allowlist_and_failures(self):
        value = {'status':'ok', 'token':'secret', 'authentication': {
            'state':'ready', 'loginRequired':False, 'accessExpiresAt':123,
            'refreshExpiresAt':None, 'retryAt':None, 'accessToken':'secret'}}
        safe = ops.safe_health(value)
        self.assertNotIn('secret', json.dumps(safe))
        self.assertEqual(safe['authentication']['accessExpiresAt'], 123)
        self.assertFalse(ops.check_failed(safe))
        self.assertFalse(ops.check_failed({'state':'ready'}))
        self.assertTrue(ops.check_failed({'state':'starting'}))
        self.assertTrue(ops.check_failed({'state':'idle'}))
        self.assertTrue(ops.check_failed({'status':'ok','authentication':{'state':'retry_wait'}}))
        self.assertTrue(ops.check_failed({'status':'ok','logging':{'errors':1}}))
        self.assertTrue(ops.check_failed({'status':'ok','authentication':{'loginRequired':True}}))
        self.assertTrue(ops.check_failed({'status':'failed'}))
        self.assertTrue(ops.check_failed({'status':'ok','state':'failed'}))

    def test_own_quota_is_distinct_from_upstream_failure(self):
        for blocked in ['daily', 'minute']:
            safe=ops.safe_health({'status':'ok','quota':{'blockedBy':blocked,'dailyRemaining':0},'quantity':0})
            self.assertEqual(safe['quota']['blockedBy'],blocked)
            self.assertEqual(safe['quota']['dailyRemaining'],0)
            self.assertTrue(ops.check_failed(safe))
        self.assertEqual(ops.safe_health({'quota':{'blockedBy':None}})['quota']['blockedBy'],None)
        self.assertNotIn('blockedBy',ops.safe_health({'quota':{'blockedBy':'upstream429'}})['quota'])
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            for name in ['relay.env','dtryx.env']:
                (base/name).write_text('OY_RELAY_TOKEN=secret\nDTRYX_RELAY_TOKEN=secret\nCONVENIENCE_RELAY_TOKEN=secret\n')
                (base/name).chmod(0o600)
            with patch.object(ops,'fetch_health',return_value={'status':'ok','quota':{'blockedBy':'daily','dailyRemaining':0}}):
                result=ops.monitor(base,0)
            self.assertEqual(result['checks']['dtryx']['reason'],'own-quota')
            self.assertEqual(ops.snapshot_status(base/'ops-status.json')['checks']['dtryx']['reason'],'own-quota')

    def test_plan_and_agents(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root).resolve() / 'state'
            plan = ops.make_plan(base, Path(root).resolve() / 'runtime', 20242)
            self.assertFalse(base.exists())
            self.assertEqual(len(plan['labels']), 2)
            agents = ops.agent_plists(base, Path(root).resolve(), Path(root).resolve() / 'version', 20242)
            self.assertEqual(agents[ops.MONITOR_LABEL]['StartInterval'], 60)
            self.assertFalse(agents[ops.MONITOR_LABEL].get('KeepAlive', False))
            self.assertIn('--state-base', agents[ops.HIDE_LABEL]['ProgramArguments'])
            with self.assertRaises(ValueError): ops.make_plan(base, base, 65536)

    def test_atomic_snapshot_and_staleness(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root).resolve()
            path = base / 'ops-status.json'
            ops.write_snapshot(path, {'checkedAt':10,'checks':{}})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertTrue(ops.snapshot_status(path, now=191)['stale'])
            path.unlink()
            path.symlink_to(base / 'foreign')
            with self.assertRaises(ValueError): ops.write_snapshot(path, {})

    def test_monitor_local_only_sanitized(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            for name in ['relay.env', 'dtryx.env']:
                (base/name).write_text('OY_RELAY_TOKEN=secret\nDTRYX_RELAY_TOKEN=secret\nCONVENIENCE_RELAY_TOKEN=secret\n')
                (base/name).chmod(0o600)
            seen=[]
            def fetch(port,path,token=None):
                seen.append((port,path))
                return {'status':'ok', 'token':'secret'}
            with patch.object(ops, 'fetch_health', side_effect=fetch):
                result=ops.monitor(base, 20242)
            self.assertEqual(len(seen),5)
            self.assertTrue(all(port in [4319,4320,20242] for port,path in seen))
            self.assertNotIn('secret',json.dumps(result))
            self.assertFalse(result['failed'])
            with patch.object(ops, 'fetch_health', side_effect=ValueError('failed')):
                first=ops.monitor(base,0)
                second=ops.monitor(base,0)
            self.assertEqual(second['checks']['oliveyoung']['consecutiveFailures'],2)
            self.assertEqual(first['checks']['oliveyoung']['firstFailedAt'], second['checks']['oliveyoung']['firstFailedAt'])

    def test_configured_gs_session_requires_observable_authentication(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            for name in ['relay.env', 'dtryx.env']:
                (base/name).write_text('OY_RELAY_TOKEN=secret\nDTRYX_RELAY_TOKEN=secret\nCONVENIENCE_RELAY_TOKEN=secret\nGS25_AUTH_SESSION_FILE=/private/session-secret\n')
                (base/name).chmod(0o600)
            invalid=[None, {}, {'state':'ready'}, {'state':'ready','loginRequired':'false'},
                     {'state':'ready','loginRequired':False},
                     {'state':'ready','loginRequired':False,'accessExpiresAt':None,'refreshExpiresAt':None},
                     {'state':'ready','loginRequired':False,'accessExpiresAt':1,'refreshExpiresAt':2},
                     {'state':'unknown','loginRequired':False}]
            for authentication in invalid:
                with self.subTest(authentication=authentication):
                    response={'status':'ok','authentication':authentication}
                    with patch.object(ops,'fetch_health',return_value=response): result=ops.monitor(base,0)
                    check=result['checks']['convenience']
                    self.assertTrue(check['failed'])
                    self.assertEqual(check['reason'],'authentication-unobservable')
                    self.assertNotIn('session-secret',json.dumps(result))
            for state in ['ready', 'refreshing', 'retry_wait']:
                response={'status':'ok','authentication':{'state':state,'loginRequired':False,
                          'accessExpiresAt':(time.time()+600)*1000,'refreshExpiresAt':(time.time()+1200)*1000}}
                with patch.object(ops,'fetch_health',return_value=response): result=ops.monitor(base,0)
                self.assertNotEqual(result['checks']['convenience'].get('reason'),'authentication-unobservable')
            (base/'dtryx.env').write_text('DTRYX_RELAY_TOKEN=secret\nCONVENIENCE_RELAY_TOKEN=secret\nGS25_AUTH_SESSION_FILE=\n')
            with patch.object(ops,'fetch_health',return_value={'status':'ok'}): result=ops.monitor(base,0)
            self.assertFalse(result['checks']['convenience']['failed'])

    def test_local_login_notification_deduplicates_and_reports_failure(self):
        checks={'convenience': {'authentication': {'loginRequired':True}}}
        with patch.object(ops.subprocess,'run') as run:
            result=ops.login_notification(checks, {}, 100, True)
            self.assertEqual(result['state'],'accepted')
            ops.login_notification(checks, {'notification':result}, 101, True)
            self.assertEqual(run.call_count,1)
        with patch.object(ops.subprocess,'run',side_effect=OSError()):
            result=ops.login_notification(checks, {}, 100, True)
            self.assertEqual(result['state'],'failed')
        self.assertTrue(ops.snapshot_status(Path('/nonexistent/ops-status.json'))['failed'])

    def test_http_redirect_body_cap_proxy_bypass(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_GET(self):
                self.send_response(302 if self.path == '/redirect' else 200)
                self.send_header('Location', 'http://example.invalid/secret')
                self.end_headers()
                if self.path == '/slow':
                    try:
                        for _ in range(20):
                            self.wfile.write(b'x')
                            self.wfile.flush()
                            time.sleep(0.02)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                    return
                self.wfile.write(b'x' * (ops.CAP + 1) if self.path == '/large' else b'{"status":"ok"}')
        server = HTTPServer(('127.0.0.1', 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with patch.dict(os.environ, {'HTTP_PROXY':'http://127.0.0.1:1'}):
                self.assertEqual(ops.fetch_health(server.server_port,'/health','secret')['status'], 'ok')
                with self.assertRaises(ValueError): ops.fetch_health(server.server_port,'/redirect','secret')
                with self.assertRaises(ValueError): ops.fetch_health(server.server_port,'/large','secret')
                timer=threading.Timer
                started=time.monotonic()
                with patch.object(ops.threading,'Timer',side_effect=lambda delay,action: timer(0.05,action)):
                    with self.assertRaises(ValueError): ops.fetch_health(server.server_port,'/slow','secret')
                self.assertLess(time.monotonic()-started,0.3)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_installer_foreign_files_backup_and_versioning(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root).resolve()
            base=root/'base'
            agents=root/'agents'
            agents.mkdir(mode=0o700)
            plist=agents/(ops.HIDE_LABEL+'.plist')
            plist.write_bytes(b'<?xml version="1.0"?><plist><dict/></plist>')
            with self.assertRaises(ValueError):
                ops.install(base,root/'runtime',0,agents)
            self.assertFalse(base.exists())
            plist.unlink()
            def compiler(args, **kwargs):
                Path(args[-1]).write_bytes(b'test-helper')
            with patch.object(ops.subprocess,'run',side_effect=compiler):
                ops.install(base,root/'runtime',0,agents)
                (base/'relay.env').write_text('preserve')
                ops.install(base,root/'runtime',0,agents)
            self.assertEqual((base/'relay.env').read_text(),'preserve')
            self.assertEqual(len(list(agents.glob('*.backup-*'))),2)
            self.assertEqual(len(list((base/'ops-helpers').iterdir())),1)
            binary=next((base/'ops-helpers').iterdir())/'hide-oliveyoung'
            binary.chmod(0o600)
            with self.assertRaises(ValueError):
                ops.install(base,root/'runtime',0,agents)
            binary.chmod(0o700)
            helper=next((base/'ops-helpers').iterdir())/'macos-ops.py'
            helper.write_text('tampered')
            with self.assertRaises(ValueError):
                ops.install(base,root/'runtime',0,agents)

if __name__ == '__main__': unittest.main()
