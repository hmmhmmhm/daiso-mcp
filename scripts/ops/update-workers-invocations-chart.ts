import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  buildDataLabelIndexes,
  buildReadmeSection,
  calculateMovingAverage,
  calculateSummary,
  findMinNonZero,
  formatCompactNumber,
  formatKstDate,
  formatKstDateTime,
  formatNumber,
  isWeekendKst,
  parseKstDateText,
  shouldShowWeeklyTick,
  WORKERS_CHART_ACCENT_COLORS,
} from './workers-chart-helpers.ts';
import { fetchDailyWorkerInvocations } from './workers-chart-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const README_PATH = path.join(REPO_ROOT, 'README.md');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets', 'analytics');
const CHART_PATH = path.join(OUTPUT_DIR, 'workers-invocations.png');
const DATA_PATH = path.join(OUTPUT_DIR, 'workers-invocations.json');
const PREFERRED_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

const README_START = '<!-- WORKERS_INVOCATIONS_CHART:START -->';
const README_END = '<!-- WORKERS_INVOCATIONS_CHART:END -->';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT_NAME = process.env.CF_WORKER_SCRIPT_NAME ?? 'daiso-mcp';
const CHART_START_DATE = process.env.WORKERS_CHART_START_DATE ?? '2026-03-01';
const CHART_CONCURRENCY = Number.parseInt(process.env.WORKERS_CHART_CONCURRENCY ?? '4', 10);
const INPUT_JSON_PATH = process.env.WORKERS_CHART_INPUT_JSON;

if (!INPUT_JSON_PATH && (!ACCOUNT_ID || !API_TOKEN)) {
  throw new Error(
    'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN 환경 변수가 필요합니다. 기존 JSON으로 다시 그릴 때는 WORKERS_CHART_INPUT_JSON을 지정하세요.',
  );
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(CHART_START_DATE)) {
  throw new Error('WORKERS_CHART_START_DATE 형식은 YYYY-MM-DD 이어야 합니다.');
}

function formatDelta(diff) {
  if (diff > 0) {
    return `+${formatNumber(diff)}`;
  }
  return formatNumber(diff);
}

function formatSignedNumber(value) {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  return formatNumber(value);
}

async function readInputPayload(inputPath) {
  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(REPO_ROOT, inputPath);
  const payload = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  if (!Array.isArray(payload.points)) {
    throw new Error(`points 배열이 없는 JSON입니다: ${resolvedPath}`);
  }
  return payload;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function linePath(points) {
  return points
    .filter((point) => point.y !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

function metricSvg(x, y, label, value, color = '#111827') {
  return [
    `<text x="${x}" y="${y}" class="metric-label">${escapeXml(label)}</text>`,
    `<text x="${x}" y="${y + 24}" class="metric-value" fill="${color}">${escapeXml(value)}</text>`,
  ].join('\n');
}

function renderRecent14Panel(points, chartArea) {
  const recent = points.slice(-14);
  if (recent.length === 0) {
    return '';
  }

  const values = recent.map((point) => point.requests);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const x = chartArea.left;
  const y = chartArea.bottom + 36;
  const width = chartArea.right - chartArea.left;
  const height = 86;
  const innerTop = y + 34;
  const innerBottom = y + height - 20;
  const toX = (index) => x + 18 + (index / Math.max(recent.length - 1, 1)) * (width - 36);
  const toY = (value) => innerBottom - ((value - min) / range) * (innerBottom - innerTop);
  const recentPath = linePath(recent.map((point, index) => ({ x: toX(index), y: toY(point.requests) })));
  const latest = recent[recent.length - 1];

  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#f8fafc" stroke="rgba(15,23,42,0.12)" />
    <text x="${x + 14}" y="${y + 21}" class="panel-title">Last 14 days</text>
    <text x="${x + 118}" y="${y + 21}" class="small-muted">${escapeXml(recent[0]?.date ?? '')} ~ ${escapeXml(recent[recent.length - 1]?.date ?? '')}</text>
    <line x1="${x + 14}" y1="${innerBottom}" x2="${x + width - 14}" y2="${innerBottom}" stroke="rgba(148,163,184,0.35)" />
    <path d="${recentPath}" fill="none" stroke="${WORKERS_CHART_ACCENT_COLORS.recent14Line}" stroke-width="2" />
    ${recent
      .map((point, index) => {
        const radius = index === recent.length - 1 ? 4 : 2.5;
        return `<circle cx="${toX(index).toFixed(1)}" cy="${toY(point.requests).toFixed(1)}" r="${radius}" fill="${WORKERS_CHART_ACCENT_COLORS.recent14Line}" />`;
      })
      .join('\n')}
    ${
      latest
        ? `<text x="${x + width - 16}" y="${y + 22}" text-anchor="end" class="recent-label">Latest ${escapeXml(formatNumber(latest.requests))}</text>`
        : ''
    }
  `;
}

async function renderChart(points, summary, metadata) {
  const movingAverage = calculateMovingAverage(points, 7);
  const values = points.map((point) => point.requests);
  const labels = points.map((point) => point.date.slice(5));
  const width = 1400;
  const height = 720;
  const chartArea = { left: 76, top: 104, right: 1360, bottom: 436 };
  const plotWidth = chartArea.right - chartArea.left;
  const plotHeight = chartArea.bottom - chartArea.top;
  const maxValue = Math.max(...values, 1);
  const yMax = Math.ceil(maxValue / 1000) * 1000 || 1000;
  const toX = (index) => chartArea.left + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const toY = (value) => chartArea.bottom - (value / yMax) * plotHeight;
  const chartPoints = points.map((point, index) => ({ x: toX(index), y: toY(point.requests) }));
  const averagePoints = movingAverage.map((value, index) => ({
    x: toX(index),
    y: value === null ? null : toY(value),
  }));
  const minNonZero = findMinNonZero(points);
  const peakIndex = values.findIndex((value) => value === Math.max(...values));
  const minNonZeroIndex = points.findIndex((point) => point.date === minNonZero.date);
  const latestIndex = points.length - 1;
  const dataLabelIndexes = buildDataLabelIndexes(points);
  const line = linePath(chartPoints);
  const area = `${line} L ${chartArea.right} ${chartArea.bottom} L ${chartArea.left} ${chartArea.bottom} Z`;
  const movingAverageLine = linePath(averagePoints);
  const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((yMax / 5) * index));
  const highlighted = new Set([latestIndex, peakIndex, minNonZeroIndex]);
  const metricWidth = plotWidth / 6;
  const summaryY = chartArea.bottom + 132;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      text { font-family: ${PREFERRED_FONT_FAMILY}; }
      .title { font-size: 18px; font-weight: 700; fill: #111827; }
      .subtitle, .small-muted, .axis { font-size: 11px; fill: #64748b; }
      .legend { font-size: 12px; fill: #334155; }
      .panel-title { font-size: 13px; font-weight: 700; fill: #0f172a; }
      .metric-label { font-size: 12px; fill: #64748b; }
      .metric-value { font-size: 18px; font-weight: 700; }
      .data-label { font-size: 10px; font-weight: 700; fill: #7c2d12; }
      .recent-label { font-size: 12px; font-weight: 700; fill: ${WORKERS_CHART_ACCENT_COLORS.recent14Label}; }
    </style>
    <rect width="${width}" height="${height}" fill="#ffffff" />
    <text x="${width / 2}" y="42" text-anchor="middle" class="title">${escapeXml(`Cloudflare Workers Invocations (${metadata.startDate} ~ ${metadata.endDate}, ${labels.length} days)`)}</text>
    <text x="${width / 2}" y="66" text-anchor="middle" class="subtitle">${escapeXml(`Updated: ${metadata.updatedAtText}`)}</text>
    <rect x="920" y="82" width="16" height="10" fill="rgba(244,129,32,0.25)" stroke="#f48120" />
    <text x="944" y="91" class="legend">Requests</text>
    <line x1="1016" y1="87" x2="1040" y2="87" stroke="${WORKERS_CHART_ACCENT_COLORS.movingAverage}" stroke-width="2" stroke-dasharray="6 4" />
    <text x="1048" y="91" class="legend">7-day avg</text>
    ${points
      .map((point, index) => {
        if (!isWeekendKst(point.date)) return '';
        const center = toX(index);
        const prev = toX(Math.max(index - 1, 0));
        const next = toX(Math.min(index + 1, points.length - 1));
        const halfWidth = Math.max((next - prev) / 2, 8);
        return `<rect x="${Math.max(center - halfWidth, chartArea.left).toFixed(1)}" y="${chartArea.top}" width="${Math.min(center + halfWidth, chartArea.right) - Math.max(center - halfWidth, chartArea.left)}" height="${plotHeight}" fill="rgba(24,92,160,0.06)" />`;
      })
      .join('\n')}
    ${yTicks
      .map((tick) => {
        const y = toY(tick);
        return `<line x1="${chartArea.left}" y1="${y.toFixed(1)}" x2="${chartArea.right}" y2="${y.toFixed(1)}" stroke="rgba(0,0,0,0.08)" /><text x="${chartArea.left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="axis">${escapeXml(formatCompactNumber(tick))}</text>`;
      })
      .join('\n')}
    ${points
      .map((point, index) => {
        if (!shouldShowWeeklyTick(points, index)) return '';
        const x = toX(index);
        return `<line x1="${x.toFixed(1)}" y1="${chartArea.top}" x2="${x.toFixed(1)}" y2="${chartArea.bottom}" stroke="rgba(0,0,0,0.08)" /><text x="${x.toFixed(1)}" y="${chartArea.bottom + 22}" text-anchor="middle" class="axis">${escapeXml(labels[index] ?? '')}</text>`;
      })
      .join('\n')}
    <path d="${area}" fill="rgba(244,129,32,0.15)" />
    <path d="${line}" fill="none" stroke="#f48120" stroke-width="3" />
    <path d="${movingAverageLine}" fill="none" stroke="${WORKERS_CHART_ACCENT_COLORS.movingAverage}" stroke-width="2" stroke-dasharray="6 4" />
    ${chartPoints
      .map((point, index) => {
        const radius = highlighted.has(index) ? 6 : 2.5;
        return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius}" fill="${highlighted.has(index) ? '#b45309' : '#f48120'}" />`;
      })
      .join('\n')}
    ${[...dataLabelIndexes]
      .map((index) => {
        const point = chartPoints[index];
        if (!point) return '';
        return `<text x="${point.x.toFixed(1)}" y="${(point.y - 10).toFixed(1)}" text-anchor="middle" class="data-label">${escapeXml(formatNumber(points[index]?.requests ?? 0))}</text>`;
      })
      .join('\n')}
    ${renderRecent14Panel(points, chartArea)}
    <rect x="${chartArea.left}" y="${summaryY}" width="${plotWidth}" height="54" rx="8" fill="rgba(255,255,255,0.92)" stroke="rgba(15,23,42,0.15)" />
    ${metricSvg(chartArea.left + 18, summaryY + 19, 'Total', formatCompactNumber(summary.total))}
    ${metricSvg(chartArea.left + metricWidth + 18, summaryY + 19, 'Avg/day', formatCompactNumber(summary.average))}
    ${metricSvg(chartArea.left + metricWidth * 2 + 18, summaryY + 19, 'Median', formatCompactNumber(summary.median))}
    ${metricSvg(chartArea.left + metricWidth * 3 + 18, summaryY + 19, 'Recent 7d avg', formatCompactNumber(summary.recent7Average))}
    ${metricSvg(chartArea.left + metricWidth * 4 + 18, summaryY + 19, 'WoW', formatSignedNumber(summary.weekOverWeekDiff), summary.weekOverWeekDiff >= 0 ? '#047857' : '#b91c1c')}
    ${metricSvg(chartArea.left + metricWidth * 5 + 18, summaryY + 19, 'DoD', formatDelta(summary.dayOverDayDiff), summary.dayOverDayDiff >= 0 ? '#047857' : '#b91c1c')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function updateReadme(section) {
  const readme = await fs.readFile(README_PATH, 'utf8');
  const pattern = new RegExp(`${README_START}[\\s\\S]*?${README_END}`, 'm');
  const withoutSection = readme.replace(pattern, '').replace(/\n{3,}/g, '\n\n');
  const badgesAnchor = '\n\n<br>\n\n<br>\n\n<img src="https://i.imgur.com/mPwS4Kv.png"';

  const next = withoutSection.includes(badgesAnchor)
    ? withoutSection.replace(
        badgesAnchor,
        `\n\n${section}\n\n<br>\n\n<br>\n\n<img src="https://i.imgur.com/mPwS4Kv.png"`,
      )
    : `${section}\n\n${withoutSection}`;

  await fs.writeFile(README_PATH, next, 'utf8');
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const renderedAt = new Date();
  let points: Array<{ date: string; requests: number }>;
  let scriptName = SCRIPT_NAME;
  let startDate = CHART_START_DATE;
  let endDate: string;
  let updatedAt = renderedAt.toISOString();

  if (INPUT_JSON_PATH) {
    const inputPayload = await readInputPayload(INPUT_JSON_PATH);
    points = inputPayload.points;
    scriptName = inputPayload.scriptName ?? scriptName;
    startDate = inputPayload.startDate ?? points[0]?.date ?? startDate;
    endDate = inputPayload.endDate ?? points[points.length - 1]?.date ?? startDate;
    updatedAt = inputPayload.updatedAt ?? updatedAt;
  } else {
    const todayKstDate = formatKstDate(renderedAt);
    const endDateExclusive = parseKstDateText(todayKstDate);
    endDate = formatKstDate(new Date(endDateExclusive.getTime() - 86400000));

    points = await fetchDailyWorkerInvocations({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      scriptName,
      startDateText: startDate,
      endDateText: endDate,
      concurrency:
        Number.isFinite(CHART_CONCURRENCY) && CHART_CONCURRENCY > 0 ? CHART_CONCURRENCY : 4,
    });
  }

  const summary = calculateSummary(points);
  const chartBuffer = await renderChart(points, summary, {
    startDate,
    endDate,
    updatedAtText: formatKstDateTime(new Date(updatedAt)),
  });
  await fs.writeFile(CHART_PATH, chartBuffer);
  const payload = {
    scriptName,
    metric: 'workersInvocationsAdaptive.requests',
    aggregation: 'script-level',
    includedTraffic:
      'All invocations for this Worker script are counted across routes and domains, including GET / on mcp.aka.page.',
    timezone: 'Asia/Seoul',
    days: points.length,
    startDate,
    endDate,
    updatedAt,
    renderedAt: renderedAt.toISOString(),
    ...summary,
    points,
  };
  await fs.writeFile(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const section = buildReadmeSection({
    scriptName,
    updatedAt: formatKstDateTime(renderedAt),
    days: points.length,
    startDate,
    endDate,
    cacheKey: payload.renderedAt,
  });
  await updateReadme(section);

  console.log(
    `[workers-chart] script=${scriptName} days=${points.length} total=${formatNumber(payload.total)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
