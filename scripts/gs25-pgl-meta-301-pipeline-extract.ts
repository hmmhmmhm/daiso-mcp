#!/usr/bin/env node

/**
 * raw frida 로그에서 Java/Pipeline JSONL을 분리합니다.
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: npx tsx scripts/gs25-pgl-meta-301-pipeline-extract.ts <raw.log> <java.jsonl> <pipe.jsonl>',
  );
}

function lineToJson(line, tag) {
  if (!line.includes(tag)) return null;
  const idx = line.indexOf('{');
  if (idx < 0) return null;
  const js = line.slice(idx).trim();
  try {
    JSON.parse(js);
    return js;
  } catch {
    return null;
  }
}

function main() {
  const raw = process.argv[2];
  const javaOut = process.argv[3];
  const pipeOut = process.argv[4];
  if (!raw || !javaOut || !pipeOut) {
    usage();
    process.exit(1);
  }
  const lines = fs.readFileSync(raw, 'utf8').split(/\r?\n/);
  const java = [];
  const pipe = [];
  for (const line of lines) {
    const j = lineToJson(line, '[GS25_PGL_META]');
    if (j) java.push(j);
    const p = lineToJson(line, '[GS25_PGL_301_PIPE]');
    if (p) pipe.push(p);
  }
  fs.writeFileSync(javaOut, java.join('\n') + (java.length ? '\n' : ''), 'utf8');
  fs.writeFileSync(pipeOut, pipe.join('\n') + (pipe.length ? '\n' : ''), 'utf8');
  console.log(
    JSON.stringify(
      { raw, javaOut, pipeOut, javaEvents: java.length, pipeEvents: pipe.length },
      null,
      2,
    ),
  );
}

main();
