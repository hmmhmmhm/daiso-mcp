#!/usr/bin/env node

/**
 * blutter 산출물(pp.txt/asm)에서 GS25 핵심 신호를 추출한다.
 *
 * 사용 예시:
 * node scripts/gs25-new-blutter-signal-extract.mjs \
 *   --in tmp/gs25-static/blutter-out-gs25 \
 *   --out docs/gs25-new-blutter-signal-summary.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';

function getArg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function safeRead(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function findAll(text, regex) {
  const out = [];
  for (const m of text.matchAll(regex)) {
    if (m[1]) out.push(m[1]);
  }
  return uniq(out).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const inDir = getArg('--in', 'tmp/gs25-static/blutter-out-gs25');
  const outFile = getArg('--out', 'docs/gs25-new-blutter-signal-summary.md');

  const ppPath = path.join(inDir, 'pp.txt');
  const asmCryptoPath = path.join(
    inDir,
    'asm/gstown/src/network/api_response_encryption_utility.dart',
  );
  const asmB2cPath = path.join(inDir, 'asm/gstown/src/network/interface/b2c_api_interface.dart');
  const asmAuthPath = path.join(inDir, 'asm/gstown/src/network/grm_auth_api.dart');

  const [pp, asmCrypto, asmB2c, asmAuth] = await Promise.all([
    safeRead(ppPath),
    safeRead(asmCryptoPath),
    safeRead(asmB2cPath),
    safeRead(asmAuthPath),
  ]);

  const urls = findAll(pp, /String:\s+"(\/[A-Za-z0-9_./?&=%-]+)"/g).filter(
    (s) => s.includes('/refrigerator/') || s.includes('/api/bff/'),
  );
  const keyLike = findAll(pp, /String:\s+"([A-Za-z0-9+/=]{32,})"/g).filter((s) => {
    if (s.length !== 32) return false;
    if (s.startsWith('/')) return false;
    if (s.includes('/') && !s.includes('+')) return false;
    if (s.includes('.')) return false;
    if (!/[A-Z]/.test(s)) return false;
    if (!/[a-z]/.test(s)) return false;
    if (!/[0-9]/.test(s)) return false;
    return true;
  });
  const envVars = findAll(pp, /String:\s+"([A-Z0-9_]{8,})"/g).filter(
    (s) => s.includes('WOODONGS') || s.includes('B2C') || s.includes('REFRIGERATOR'),
  );
  const woodongsPaths = urls.filter((s) => s.toLowerCase().includes('woodongs'));
  const refrPaths = urls.filter((s) => s.toLowerCase().includes('refrigerator'));

  const hasEncrypt64 = asmCrypto.includes('Encrypter::decrypt64');
  const hasEncryptBytes = asmCrypto.includes('Encrypter::encryptBytes');
  const hasCreateEncrypter = asmCrypto.includes('ApiResponseEncryptionUtility::createEncrypter');
  const hasB2cInterface = asmB2c.includes('b2c_api_interface.dart');
  const hasWoodongsUserInfo = asmAuth.includes('getWoodongsUserInfo');

  const markdown = [
    '# GS25 New Blutter Signal Summary',
    '',
    `- 입력 디렉터리: \`${inDir}\``,
    `- 생성 시각(로컬): \`${new Date().toISOString()}\``,
    '',
    '## 1) 핵심 신호',
    `- \`ApiResponseEncryptionUtility::createEncrypter\`: ${hasCreateEncrypter ? 'yes' : 'no'}`,
    `- \`Encrypter::decrypt64\`: ${hasEncrypt64 ? 'yes' : 'no'}`,
    `- \`Encrypter::encryptBytes\`: ${hasEncryptBytes ? 'yes' : 'no'}`,
    `- \`b2c_api_interface.dart\` 존재: ${hasB2cInterface ? 'yes' : 'no'}`,
    `- \`getWoodongsUserInfo\` 흔적: ${hasWoodongsUserInfo ? 'yes' : 'no'}`,
    '',
    '## 2) 환경/상수 후보',
    ...envVars.map((v) => `- \`${v}\``),
    '',
    '## 3) 키 후보(길이>=32)',
    ...keyLike.slice(0, 20).map((v) => `- \`${v}\``),
    '',
    `- 총 ${keyLike.length}개 (문서에는 최대 20개만 표시)`,
    '',
    '## 4) 엔드포인트 후보',
    '### refrigerator',
    ...refrPaths.slice(0, 50).map((v) => `- \`${v}\``),
    '',
    '### woodongs/bff',
    ...woodongsPaths.slice(0, 50).map((v) => `- \`${v}\``),
    '',
    `- 전체 URL 후보: ${urls.length}개`,
    '',
  ].join('\n');

  await fs.writeFile(outFile, `${markdown}\n`, 'utf8');
  process.stdout.write(`wrote: ${outFile}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
