#!/usr/bin/env node

/**
 * GS25 JNI RegisterNatives 이벤트 요약기
 *
 * 입력:
 * - gs25-jni-natives-events.jsonl
 *
 * 출력:
 * - 클래스별 native 메서드 목록
 * - 모듈별 등록 건수
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-jni-natives-summary.ts <events.jsonl>');
}

function parseJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function inc(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const byClass = new Map();
  const byModule = new Map();

  for (const e of events) {
    if (!e || e.t !== 'register_native') continue;
    const className = String(e.className ?? 'unknown');
    const moduleName = String(e.moduleName ?? 'unknown');
    const row = {
      name: String(e.name ?? ''),
      signature: String(e.signature ?? ''),
      fnPtr: String(e.fnPtr ?? ''),
      moduleName,
      moduleOffset: String(e.moduleOffset ?? ''),
    };

    if (!byClass.has(className)) byClass.set(className, []);
    byClass.get(className).push(row);
    inc(byModule, moduleName);
  }

  const classes = [...byClass.entries()]
    .map(([className, methods]) => ({
      className,
      count: methods.length,
      methods: methods.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count);

  const modules = [...byModule.entries()]
    .map(([moduleName, count]) => ({ moduleName, count }))
    .sort((a, b) => b.count - a.count);

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        totalRegisteredMethods: classes.reduce((acc, c) => acc + c.count, 0),
        modules,
        classes,
      },
      null,
      2,
    ),
  );
}

main();

