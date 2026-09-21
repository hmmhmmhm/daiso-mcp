import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.skipIf(process.platform === 'win32')('설치 원본의 외부·끊어진 링크를 거절하고 내부 링크만 허용한다',()=>{
  const output=execFileSync(process.platform==='darwin'?'/usr/bin/python3':'python3',['-c',`
import runpy,tempfile
from pathlib import Path
m=runpy.run_path('scripts/relay/install-macos.py')
with tempfile.TemporaryDirectory() as d:
 root=Path(d).resolve()/'root';root.mkdir();(root/'file').write_text('safe')
 (root/'link').symlink_to('file');m['validate_tree'](root)
 (root/'link').unlink();(root/'link').symlink_to('../outside')
 try:m['validate_tree'](root);raise AssertionError('escaping link accepted')
 except ValueError:pass
 (root/'link').unlink();(root/'link').symlink_to(root/'file')
 try:m['validate_tree'](root);raise AssertionError('absolute link accepted')
 except ValueError:pass
print('ok')
`],{encoding:'utf8'});
  expect(output.trim()).toBe('ok');
});
it.skipIf(process.platform === 'win32')('설치 후속 단계가 실패하면 새 런타임과 비밀 파일을 회수한다',()=>{
  const output=execFileSync(process.platform==='darwin'?'/usr/bin/python3':'python3',['-c',`
import importlib.util,tempfile,os,types
from pathlib import Path
spec=importlib.util.spec_from_file_location('installer','scripts/relay/install-macos.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 root=Path(d).resolve();source=root/'source';source.mkdir();browser=root/'browser';browser.mkdir();home=root/'home';home.mkdir()
 for n in ['scripts/relay','src','node_modules']:(source/n).mkdir(parents=True)
 for n in ['package.json','package-lock.json','tsconfig.json']:(source/n).write_text('{}')
 user=types.SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid())
 original=m.write_owned; calls=0
 def fail(path,content,uid,gid,mode):
  global calls
  calls+=1
  if calls==2:raise OSError('test failure')
  return original(path,content,uid,gid,mode)
 m.write_owned=fail
 try:m.install_files(source,browser,root/'runtime',home,user,{'relayToken':'test','tunnelToken':'test'},Path('/node'),Path('/cf'));raise AssertionError('failure expected')
 except OSError:pass
 assert not (root/'runtime').exists()
 assert not (home/'Library/Application Support/DaisoRelay/relay.env').exists()
 assert not list(root.glob('DaisoRelay.staging-*'))
print('ok')
`],{encoding:'utf8'});
  expect(output.trim()).toBe('ok');
});
