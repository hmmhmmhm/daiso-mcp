#!/usr/bin/env node

/**
 * GS25 WebView 리플레이 이벤트(JSONL)를 파라미터 JSON으로 변환
 *
 * 입력:
 * - 라인당 JSON 1개 형식
 * - 필드: t, ts, payload
 *
 * 출력:
 * - latestState 기반 리플레이 파라미터 JSON
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    '사용법: node scripts/gs25-replay-events-to-params.mjs <input.jsonl> [output.json] [--strict-core]',
  );
}

function parseEvents(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && typeof obj.t === 'string') {
        events.push(obj);
      }
    } catch {
      // JSONL 외 라인은 무시
    }
  }
  return events;
}

function latestByType(events, type) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].t === type) {
      return events[i];
    }
  }
  return null;
}

function buildReplayParams(events, inputPath) {
  const lastMarkers = latestByType(events, 'markers');
  const lastClick = latestByType(events, 'marker_click');
  const lastCenter = latestByType(events, 'center');
  const lastLevel = latestByType(events, 'level');
  const lastTouchable = latestByType(events, 'touchable');

  const stores = Array.isArray(lastMarkers?.payload?.stores) ? lastMarkers.payload.stores : [];
  const storeMap = Object.fromEntries(stores.map((s) => [s.storeCode, s]));
  const selectedStoreCode =
    typeof lastClick?.payload?.storeCode === 'string' ? lastClick.payload.storeCode : null;
  const selectedStore = selectedStoreCode ? storeMap[selectedStoreCode] || null : null;

  const replaySteps = events
    .filter((e) =>
      ['markers', 'marker_click', 'center', 'level', 'touchable'].includes(e.t),
    )
    .map((e) => ({
      t: e.t,
      ts: e.ts ?? null,
      payload: e.payload ?? {},
    }));

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path.resolve(inputPath),
    eventCount: events.length,
    latestState: {
      markersCount: stores.length,
      stores,
      markerClick: lastClick?.payload ?? null,
      selectedStore,
      center: lastCenter?.payload ?? null,
      level: lastLevel?.payload ?? null,
      touchable: lastTouchable?.payload ?? null,
    },
    replaySequence: replaySteps,
  };
}

function getMissingCoreEventTypes(events) {
  const coreTypes = ['markers', 'marker_click', 'center', 'level', 'touchable'];
  const seen = new Set(events.map((e) => e.t));
  return coreTypes.filter((t) => !seen.has(t));
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  if (!inputPath) {
    usage();
    process.exit(1);
  }

  const strictCore = args.includes('--strict-core');
  const outputPathArg = args.find((arg, idx) => idx > 0 && !arg.startsWith('--'));

  const outputPath =
    outputPathArg ??
    path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}.params.json`,
    );

  const events = parseEvents(inputPath);
  if (events.length === 0) {
    console.error(`이벤트를 찾지 못했습니다: ${inputPath}`);
    process.exit(2);
  }

  const missingCoreTypes = getMissingCoreEventTypes(events);
  if (strictCore && missingCoreTypes.length > 0) {
    console.error(
      `핵심 이벤트 누락(${missingCoreTypes.length}): ${missingCoreTypes.join(', ')}`,
    );
    process.exit(3);
  }

  const out = buildReplayParams(events, inputPath);
  out.validation = {
    coreEventTypes: ['markers', 'marker_click', 'center', 'level', 'touchable'],
    missingCoreEventTypes: missingCoreTypes,
    isCoreReplayReady: missingCoreTypes.length === 0,
  };
  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
  console.log(`변환 완료: ${outputPath}`);
  console.log(`이벤트 수: ${events.length}`);
  console.log(`최신 매장 수: ${out.latestState.markersCount}`);
  if (missingCoreTypes.length === 0) {
    console.log('검증: 핵심 이벤트 5종 충족');
  } else {
    console.log(`검증: 핵심 이벤트 누락 -> ${missingCoreTypes.join(', ')}`);
  }
}

main();
