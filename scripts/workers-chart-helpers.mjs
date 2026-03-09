export function formatKstDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatKstDateTime(date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute} KST`;
}

export function buildKstDateRange(days, now = new Date()) {
  const list = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    list.push(formatKstDate(date));
  }
  return list;
}

export function formatNumber(value) {
  return Number(value).toLocaleString('ko-KR');
}

export function formatCompactNumber(value) {
  const numeric = Number(value);
  if (Math.abs(numeric) >= 1000) {
    const unit = numeric / 1000;
    const digits = Math.abs(unit) >= 10 ? 0 : 1;
    return `${unit.toFixed(digits)}k`;
  }
  return formatNumber(numeric);
}

export function aggregateByKstDate(rows, days) {
  const dateRange = buildKstDateRange(days);
  const map = new Map(dateRange.map((date) => [date, 0]));

  for (const row of rows) {
    const datetime = row?.dimensions?.datetime;
    const requests = Number(row?.sum?.requests ?? 0);
    if (!datetime || Number.isNaN(requests)) {
      continue;
    }

    const dateKey = formatKstDate(new Date(datetime));
    if (map.has(dateKey)) {
      map.set(dateKey, map.get(dateKey) + requests);
    }
  }

  return Array.from(map.entries()).map(([date, requests]) => ({ date, requests }));
}

export function calculateMovingAverage(points, windowSize = 7) {
  return points.map((_, index) => {
    if (index < windowSize - 1) {
      return null;
    }
    const slice = points.slice(index - windowSize + 1, index + 1);
    const sum = slice.reduce((acc, point) => acc + point.requests, 0);
    return Math.round(sum / windowSize);
  });
}

export function isWeekendKst(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(date);
  return weekday === 'Sat' || weekday === 'Sun';
}

export function findMinNonZero(points) {
  const candidates = points.filter((point) => point.requests > 0);
  if (candidates.length === 0) {
    return points[0] ?? { date: formatKstDate(new Date()), requests: 0 };
  }
  return candidates.reduce((min, point) => (point.requests < min.requests ? point : min));
}

export function buildPointStyleArray(length, base, highlights) {
  const values = new Array(length).fill(base);
  for (const { index, value } of highlights) {
    if (index >= 0 && index < length) {
      values[index] = value;
    }
  }
  return values;
}

export function createWeekendShadePlugin(points) {
  const weekendIndexes = points
    .map((point, index) => (isWeekendKst(point.date) ? index : -1))
    .filter((index) => index >= 0);

  return {
    id: 'weekend-shade',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x;
      if (!x || !chartArea) {
        return;
      }

      ctx.save();
      for (const index of weekendIndexes) {
        const center = x.getPixelForValue(index);
        const prev = x.getPixelForValue(Math.max(index - 1, 0));
        const next = x.getPixelForValue(Math.min(index + 1, points.length - 1));
        const halfWidth = Math.max((next - prev) / 2, 8);
        const left = Math.max(center - halfWidth, chartArea.left);
        const right = Math.min(center + halfWidth, chartArea.right);
        ctx.fillStyle = 'rgba(24, 92, 160, 0.06)';
        ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
      }
      ctx.restore();
    },
  };
}

export function calculateSummary(points, days) {
  const total = points.reduce((sum, point) => sum + point.requests, 0);
  const average = Math.round(total / days);
  const peak = points.reduce(
    (max, point) => (point.requests > max.requests ? point : max),
    points[0] ?? { date: formatKstDate(new Date()), requests: 0 },
  );
  const recent7Total = points.slice(-7).reduce((sum, point) => sum + point.requests, 0);
  const latest = points[points.length - 1] ?? { date: formatKstDate(new Date()), requests: 0 };
  const previous = points[points.length - 2] ?? latest;
  const dayOverDayDiff = latest.requests - previous.requests;
  const dayOverDayPercent =
    previous.requests > 0 ? (dayOverDayDiff / previous.requests) * 100 : null;

  return {
    total,
    average,
    peak,
    recent7Total,
    latest,
    previous,
    dayOverDayDiff,
    dayOverDayPercent,
  };
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

export function buildReadmeSection({ scriptName, updatedAt, days, summary }) {
  return [
    '<!-- WORKERS_INVOCATIONS_CHART:START -->',
    '<br>',
    '',
    `<h3>Cloudflare Workers 호출량 (최근 ${days}일)</h3>`,
    '',
    `<img src="./assets/analytics/workers-invocations.png" alt="Cloudflare Workers 호출량 그래프 (최근 ${days}일)" width="860">`,
    '',
    '<p><strong>요약 지표</strong></p>',
    `<p><strong>전체 호출량:</strong> ${formatNumber(summary.total)}회 · <strong>일평균:</strong> ${formatNumber(summary.average)}회 · <strong>최근 7일:</strong> ${formatNumber(summary.recent7Total)}회</p>`,
    `<p><strong>최대:</strong> ${formatNumber(summary.peak.requests)}회 (${summary.peak.date.slice(5)}) · <strong>최근:</strong> ${formatNumber(summary.latest.requests)}회 (${summary.latest.date.slice(5)}) · <strong>전일:</strong> ${formatNumber(summary.previous.requests)}회 (${summary.previous.date.slice(5)})</p>`,
    `<p><strong>전일 대비:</strong> ${formatDelta(summary.dayOverDayDiff)}회 (${formatDeltaPercent(summary.dayOverDayPercent)})</p>`,
    '',
    `<sub>기준 워커: <code>${scriptName}</code> · 마지막 갱신: ${updatedAt}</sub>`,
    '',
    '<!-- WORKERS_INVOCATIONS_CHART:END -->',
  ].join('\n');
}
