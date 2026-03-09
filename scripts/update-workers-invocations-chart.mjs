import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  aggregateByKstDateRange,
  buildPointStyleArray,
  buildReadmeSection,
  calculateMovingAverage,
  calculateSummary,
  createWeekendShadePlugin,
  findMinNonZero,
  formatCompactNumber,
  formatKstDate,
  formatKstDateTime,
  formatNumber,
  parseKstDateText,
} from './workers-chart-helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const README_PATH = path.join(REPO_ROOT, 'README.md');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets', 'analytics');
const CHART_PATH = path.join(OUTPUT_DIR, 'workers-invocations.png');
const DATA_PATH = path.join(OUTPUT_DIR, 'workers-invocations.json');

const README_START = '<!-- WORKERS_INVOCATIONS_CHART:START -->';
const README_END = '<!-- WORKERS_INVOCATIONS_CHART:END -->';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT_NAME = process.env.CF_WORKER_SCRIPT_NAME ?? 'daiso-mcp';
const CHART_START_DATE = process.env.WORKERS_CHART_START_DATE ?? '2026-03-01';

if (!ACCOUNT_ID || !API_TOKEN) {
  throw new Error(
    'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN 환경 변수가 필요합니다.',
  );
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(CHART_START_DATE)) {
  throw new Error('WORKERS_CHART_START_DATE 형식은 YYYY-MM-DD 이어야 합니다.');
}

async function fetchWorkerInvocations({
  accountId,
  apiToken,
  scriptName,
  startDateText,
  endDateExclusive,
}) {
  const start = parseKstDateText(startDateText);

  const query = `
    query WorkerInvocations($accountTag: string, $scriptName: string, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: { scriptName: $scriptName, datetime_geq: $start, datetime_lt: $end }
          ) {
            dimensions {
              datetime
            }
            sum {
              requests
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: accountId,
        scriptName,
        start: start.toISOString(),
        end: endDateExclusive.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare GraphQL 호출 실패: ${response.status} ${body}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Cloudflare GraphQL 오류: ${JSON.stringify(payload.errors)}`);
  }

  const rows = payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(rows)) {
    throw new Error('Cloudflare 응답에서 workersInvocationsAdaptive 데이터를 찾지 못했습니다.');
  }

  return rows;
}

function formatDelta(diff) {
  if (diff > 0) {
    return `+${formatNumber(diff)}`;
  }
  return formatNumber(diff);
}

function formatDeltaPercent(percent) {
  if (percent === null) {
    return 'N/A';
  }
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function renderChart(points, summary) {
  const movingAverage = calculateMovingAverage(points, 7);
  const labels = points.map((point) => point.date.slice(5));
  const values = points.map((point) => point.requests);
  const latestIndex = points.length - 1;
  const peakIndex = values.findIndex((value) => value === Math.max(...values));
  const minNonZero = findMinNonZero(points);
  const minNonZeroIndex = points.findIndex((point) => point.date === minNonZero.date);
  const highlights = [
    { index: latestIndex, value: 6 },
    { index: peakIndex, value: 6 },
    { index: minNonZeroIndex, value: 6 },
  ];
  const weekendShadePlugin = createWeekendShadePlugin(points);
  const summaryPanelPlugin = {
    id: 'summary-panel',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) {
        return;
      }

      const x = chartArea.left;
      const y = chartArea.bottom + 44;
      const panelWidth = chartArea.right - chartArea.left;
      const panelHeight = 34;
      const line =
        `전체 ${formatNumber(summary.total)}회  |  일평균 ${formatNumber(summary.average)}회  |  ` +
        `최근 7일 ${formatNumber(summary.recent7Total)}회  |  최대 ${formatNumber(summary.peak.requests)}회 (${summary.peak.date.slice(5)})  |  ` +
        `전일 대비 ${formatDelta(summary.dayOverDayDiff)}회 (${formatDeltaPercent(summary.dayOverDayPercent)})`;

      ctx.save();
      drawRoundRect(ctx, x, y, panelWidth, panelHeight, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      let fontSize = 13;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#111827';
      while (fontSize > 10 && ctx.measureText(line).width > panelWidth - 24) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px sans-serif`;
      }
      const textWidth = ctx.measureText(line).width;
      const centeredX = x + Math.max((panelWidth - textWidth) / 2, 12);
      ctx.fillText(line, centeredX, y + 23);
      ctx.restore();
    },
  };

  const canvas = new ChartJSNodeCanvas({
    width: 1400,
    height: 560,
    backgroundColour: '#ffffff',
    chartCallback: (ChartJS) => {
      ChartJS.register(ChartDataLabels);
      ChartJS.register(weekendShadePlugin);
      ChartJS.register(summaryPanelPlugin);
    },
  });

  const configuration = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '호출 수',
          data: values,
          borderColor: '#f48120',
          backgroundColor: 'rgba(244,129,32,0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.25,
          pointRadius: buildPointStyleArray(values.length, 2.5, highlights),
          pointBackgroundColor: buildPointStyleArray(
            values.length,
            '#f48120',
            highlights.map((item) => ({ ...item, value: '#b45309' })),
          ),
          pointHoverRadius: 3,
        },
        {
          label: '7일 이동평균',
          data: movingAverage,
          borderColor: '#ea580c',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: false,
      layout: {
        padding: {
          top: 28,
          right: 16,
          left: 8,
          bottom: 112,
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            boxWidth: 16,
          },
        },
        datalabels: {
          display(context) {
            return context.datasetIndex === 0;
          },
          color(context) {
            const value = Number(context.dataset.data[context.dataIndex] ?? 0);
            return value >= 1000 ? '#7a4a1f' : '#6b7280';
          },
          anchor: 'end',
          align(context) {
            const value = Number(context.dataset.data[context.dataIndex] ?? 0);
            return value >= 1000 ? 'top' : 'end';
          },
          offset: 2,
          clamp: true,
          formatter(value) {
            return formatNumber(value);
          },
          font: {
            size: 10,
            weight: 'bold',
          },
        },
        title: {
          display: true,
          text: `Cloudflare Workers 호출량 (최근 ${labels.length}일)`,
          color: '#111111',
          font: {
            size: 20,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: false,
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatCompactNumber(value);
            },
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
          },
        },
      },
    },
  };

  return canvas.renderToBuffer(configuration);
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
  const todayKstDate = formatKstDate(new Date());
  const endDateExclusive = parseKstDateText(todayKstDate);
  const endDateInclusive = formatKstDate(new Date(endDateExclusive.getTime() - 86400000));

  const rows = await fetchWorkerInvocations({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    scriptName: SCRIPT_NAME,
    startDateText: CHART_START_DATE,
    endDateExclusive,
  });

  const points = aggregateByKstDateRange(rows, CHART_START_DATE, endDateInclusive);
  const summary = calculateSummary(points);
  const chartBuffer = await renderChart(points, summary);
  await fs.writeFile(CHART_PATH, chartBuffer);
  const payload = {
    scriptName: SCRIPT_NAME,
    timezone: 'Asia/Seoul',
    days: points.length,
    startDate: CHART_START_DATE,
    endDate: endDateInclusive,
    updatedAt: new Date().toISOString(),
    ...summary,
    points,
  };
  await fs.writeFile(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const section = buildReadmeSection({
    scriptName: SCRIPT_NAME,
    updatedAt: formatKstDateTime(new Date()),
    days: points.length,
    startDate: CHART_START_DATE,
    endDate: endDateInclusive,
    cacheKey: payload.updatedAt,
  });
  await updateReadme(section);

  console.log(
    `[workers-chart] script=${SCRIPT_NAME} days=${points.length} total=${formatNumber(payload.total)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
