import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.skipIf(process.platform === 'win32')('macOS 설치 설정은 GUI 전용 계정과 제한된 Node 메모리·재시작을 사용한다',()=>{
  const output=execFileSync(process.platform === 'darwin' ? '/usr/bin/python3' : 'python3',['-c',`
import runpy,json
from pathlib import Path
module=runpy.run_path('scripts/relay/install-macos.py')
p=module['agent_plist'](Path('/runtime'),Path('/Users/daisorelay'),Path('/node'))
t=module['tunnel_plist'](Path('/Users/daisorelay'),Path('/cloudflared'))
assert '--max-old-space-size=256' in p['ProgramArguments']
assert p['LimitLoadToSessionType']=='Aqua'
assert p['KeepAlive']=={'SuccessfulExit':False}
assert p['ThrottleInterval']==60 and not p['AbandonProcessGroup']
assert p['StandardErrorPath']=='/dev/null'
assert '--token-file' in t['ProgramArguments']
assert '--token' not in t['ProgramArguments']
assert 'UserName' not in p
print('ok')
`],{encoding:'utf8'});
  expect(output.trim()).toBe('ok');
});
