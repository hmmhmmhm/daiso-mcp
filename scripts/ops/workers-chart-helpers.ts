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

export function parseKstDateText(dateText) {
  return new Date(`${dateText}T00:00:00+09:00`);
}

export function buildKstDateRangeBetween(startDateText, endDateText) {
  const start = parseKstDateText(startDateText);
  const end = parseKstDateText(endDateText);
  const list = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    list.push(formatKstDate(cursor));
  }

  return list;
}

export function formatNumber(value) {
  return Number(value).toLocaleString('ko-KR');
}

export function formatCompactNumber(value) {
  const numeric = Number(value);
  if (Math.abs(numeric) >= 1000000) {
    const unit = numeric / 1000000;
    const digits = Math.abs(unit) >= 100 ? 0 : 1;
    return `${unit.toFixed(digits)}M`;
  }
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

export function aggregateByKstDateRange(rows, startDateText, endDateText) {
  const dateRange = buildKstDateRangeBetween(startDateText, endDateText);
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

export function isMondayKst(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(date);
  return weekday === 'Mon';
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

export function calculateMedian(points) {
  if (points.length === 0) {
    return 0;
  }

  const sorted = points.map((point) => point.requests).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function buildDataLabelIndexes(points) {
  if (points.length === 0) {
    return new Set();
  }

  const indexes = new Set([points.length - 1]);
  const values = points.map((point) => point.requests);
  const peakValue = Math.max(...values);
  const peakIndex = values.findIndex((value) => value === peakValue);
  indexes.add(peakIndex);

  const sortedByRequests = points
    .map((point, index) => ({ index, requests: point.requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, Math.min(3, points.length));
  const median = calculateMedian(points);

  for (const point of sortedByRequests) {
    if (point.requests >= median * 4) {
      indexes.add(point.index);
    }
  }

  const minimumSurge = Math.max(100, Math.round(median * 0.1));
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.requests ?? 0;
    const current = points[index]?.requests ?? 0;
    if (previous > 0 && current >= previous * 2 && current - previous >= minimumSurge) {
      indexes.add(index);
    }
  }

  return new Set([...indexes].sort((a, b) => a - b));
}

export function shouldShowWeeklyTick(points, index) {
  const point = points[index];
  if (!point) {
    return false;
  }
  if (index === 0 || index === points.length - 1) {
    return true;
  }
  return index >= 2 && index <= points.length - 3 && isMondayKst(point.date);
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

export function calculateSummary(points) {
  const total = points.reduce((sum, point) => sum + point.requests, 0);
  const average = Math.round(total / Math.max(points.length, 1));
  const median = calculateMedian(points);
  const peak = points.reduce(
    (max, point) => (point.requests > max.requests ? point : max),
    points[0] ?? { date: formatKstDate(new Date()), requests: 0 },
  );
  const recent7Total = points.slice(-7).reduce((sum, point) => sum + point.requests, 0);
  const recent7Average = Math.round(recent7Total / Math.min(points.length, 7));
  const previous7Total = points.slice(-14, -7).reduce((sum, point) => sum + point.requests, 0);
  const weekOverWeekDiff = recent7Total - previous7Total;
  const weekOverWeekPercent = previous7Total > 0 ? (weekOverWeekDiff / previous7Total) * 100 : null;
  const latest = points[points.length - 1] ?? { date: formatKstDate(new Date()), requests: 0 };
  const previous = points[points.length - 2] ?? latest;
  const dayOverDayDiff = latest.requests - previous.requests;
  const dayOverDayPercent =
    previous.requests > 0 ? (dayOverDayDiff / previous.requests) * 100 : null;

  return {
    total,
    average,
    median,
    peak,
    recent7Total,
    recent7Average,
    previous7Total,
    weekOverWeekDiff,
    weekOverWeekPercent,
    latest,
    previous,
    dayOverDayDiff,
    dayOverDayPercent,
  };
}

export function buildReadmeSection({ scriptName, updatedAt, days, startDate, endDate, cacheKey }) {
  return [
    '<!-- WORKERS_INVOCATIONS_CHART:START -->',
    `<h3>Cloudflare Workers 호출량 (${startDate} ~ ${endDate}, ${days}일)</h3>`,
    '',
    `<img src="./assets/analytics/workers-invocations.png?v=${cacheKey}" alt="Cloudflare Workers 호출량 그래프 (${startDate} ~ ${endDate})" width="100%">`,
    '',
    `<sub>기준 워커: <code>${scriptName}</code> · 마지막 갱신: ${updatedAt}</sub>`,
    '',
    '<!-- WORKERS_INVOCATIONS_CHART:END -->',
  ].join('\n');
}
