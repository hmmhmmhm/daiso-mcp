import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { registerFont } from 'canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  buildDataLabelIndexes,
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
  shouldShowWeeklyTick,
} from './workers-chart-helpers.ts';
import { fetchDailyWorkerInvocations } from './workers-chart-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const README_PATH = path.join(REPO_ROOT, 'README.md');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets', 'analytics');
const CHART_PATH = path.join(OUTPUT_DIR, 'workers-invocations.png');
const DATA_PATH = path.join(OUTPUT_DIR, 'workers-invocations.json');
const PREFERRED_FONT_FAMILY = '"Noto Sans KR", "Nanum Gothic", sans-serif';
const FONT_CANDIDATES = [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
  '/System/Library/Fonts/AppleSDGothicNeo.ttc',
];

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

function drawMetric(ctx, x, y, label, value, color = '#111827') {
  ctx.font = `12px ${PREFERRED_FONT_FAMILY}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(label, x, y);
  ctx.font = `bold 18px ${PREFERRED_FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + 24);
}

function buildRecent14PanelPlugin(points) {
  return {
    id: 'recent-14-panel',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea || points.length === 0) {
        return;
      }

      const recent = points.slice(-14);
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

      ctx.save();
      drawRoundRect(ctx, x, y, width, height, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `bold 13px ${PREFERRED_FONT_FAMILY}`;
      ctx.fillStyle = '#0f172a';
      ctx.fillText('최근 14일 확대', x + 14, y + 21);
      ctx.font = `11px ${PREFERRED_FONT_FAMILY}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(
        `${recent[0]?.date ?? ''} ~ ${recent[recent.length - 1]?.date ?? ''}`,
        x + 118,
        y + 21,
      );

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x + 14, innerBottom);
      ctx.lineTo(x + width - 14, innerBottom);
      ctx.stroke();

      const toX = (index) => x + 18 + (index / Math.max(recent.length - 1, 1)) * (width - 36);
      const toY = (value) => innerBottom - ((value - min) / range) * (innerBottom - innerTop);

      ctx.beginPath();
      recent.forEach((point, index) => {
        const px = toX(index);
        const py = toY(point.requests);
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#2563eb';
      for (const [index, point] of recent.entries()) {
        ctx.beginPath();
        ctx.arc(
          toX(index),
          toY(point.requests),
          index === recent.length - 1 ? 4 : 2.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      const latest = recent[recent.length - 1];
      if (latest) {
        ctx.font = `bold 12px ${PREFERRED_FONT_FAMILY}`;
        ctx.fillStyle = '#1d4ed8';
        ctx.textAlign = 'right';
        ctx.fillText(`최신 ${formatNumber(latest.requests)}회`, x + width - 16, y + 22);
        ctx.textAlign = 'left';
      }

      ctx.restore();
    },
  };
}

async function initializeKoreanFonts() {
  for (const fontPath of FONT_CANDIDATES) {
    try {
      await fs.access(fontPath);
      registerFont(fontPath, { family: 'Noto Sans KR' });
      registerFont(fontPath, { family: 'Nanum Gothic' });
    } catch {
      // 폰트 파일이 없으면 다음 후보를 확인합니다.
    }
  }
}

async function readInputPayload(inputPath) {
  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(REPO_ROOT, inputPath);
  const payload = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  if (!Array.isArray(payload.points)) {
    throw new Error(`points 배열이 없는 JSON입니다: ${resolvedPath}`);
  }
  return payload;
}

async function renderChart(points, summary, metadata) {
  const movingAverage = calculateMovingAverage(points, 7);
  const labels = points.map((point) => point.date.slice(5));
  const values = points.map((point) => point.requests);
  const latestIndex = points.length - 1;
  const peakIndex = values.findIndex((value) => value === Math.max(...values));
  const minNonZero = findMinNonZero(points);
  const minNonZeroIndex = points.findIndex((point) => point.date === minNonZero.date);
  const dataLabelIndexes = buildDataLabelIndexes(points);
  const highlights = [
    { index: latestIndex, value: 6 },
    { index: peakIndex, value: 6 },
    { index: minNonZeroIndex, value: 6 },
  ];
  const weekendShadePlugin = createWeekendShadePlugin(points);
  const recent14PanelPlugin = buildRecent14PanelPlugin(points);
  const summaryPanelPlugin = {
    id: 'summary-panel',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) {
        return;
      }

      const x = chartArea.left;
      const y = chartArea.bottom + 132;
      const panelWidth = chartArea.right - chartArea.left;
      const panelHeight = 54;
      const metricWidth = panelWidth / 6;

      ctx.save();
      drawRoundRect(ctx, x, y, panelWidth, panelHeight, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      drawMetric(ctx, x + 18, y + 19, '전체', `${formatCompactNumber(summary.total)}회`);
      drawMetric(
        ctx,
        x + metricWidth + 18,
        y + 19,
        '일평균',
        `${formatCompactNumber(summary.average)}회`,
      );
      drawMetric(
        ctx,
        x + metricWidth * 2 + 18,
        y + 19,
        '중앙값',
        `${formatCompactNumber(summary.median)}회`,
      );
      drawMetric(
        ctx,
        x + metricWidth * 3 + 18,
        y + 19,
        '최근 7일 평균',
        `${formatCompactNumber(summary.recent7Average)}회`,
      );
      drawMetric(
        ctx,
        x + metricWidth * 4 + 18,
        y + 19,
        '전주 대비',
        `${formatSignedNumber(summary.weekOverWeekDiff)}회`,
        summary.weekOverWeekDiff >= 0 ? '#047857' : '#b91c1c',
      );
      drawMetric(
        ctx,
        x + metricWidth * 5 + 18,
        y + 19,
        '전일 대비',
        `${formatDelta(summary.dayOverDayDiff)}회`,
        summary.dayOverDayDiff >= 0 ? '#047857' : '#b91c1c',
      );
      ctx.restore();
    },
  };

  const canvas = new ChartJSNodeCanvas({
    width: 1400,
    height: 720,
    backgroundColour: '#ffffff',
    chartCallback: (ChartJS) => {
      ChartJS.defaults.font.family = PREFERRED_FONT_FAMILY;
      ChartJS.register(ChartDataLabels);
      ChartJS.register(weekendShadePlugin);
      ChartJS.register(recent14PanelPlugin);
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
          borderColor: '#2563eb',
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
          bottom: 220,
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
            return context.datasetIndex === 0 && dataLabelIndexes.has(context.dataIndex);
          },
          color(context) {
            const value = Number(context.dataset.data[context.dataIndex] ?? 0);
            return value >= 1000 ? '#7c2d12' : '#6b7280';
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
            family: PREFERRED_FONT_FAMILY,
            size: 10,
            weight: 'bold',
          },
        },
        title: {
          display: true,
          text: [
            `Cloudflare Workers 호출량 (${metadata.startDate} ~ ${metadata.endDate}, ${labels.length}일)`,
            `데이터 갱신: ${metadata.updatedAtText}`,
          ],
          color: '#111111',
          font: {
            family: PREFERRED_FONT_FAMILY,
            size: 18,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            callback(_value, index) {
              return shouldShowWeeklyTick(points, index) ? labels[index] : '';
            },
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
  await initializeKoreanFonts();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const renderedAt = new Date();
  let points;
  let scriptName = SCRIPT_NAME;
  let startDate = CHART_START_DATE;
  let endDate;
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
