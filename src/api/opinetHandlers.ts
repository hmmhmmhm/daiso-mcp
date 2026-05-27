import { getErrorMessage } from '../core/errors.js';
import {
  fetchOpinetAveragePrices,
  fetchOpinetLowestStations,
  fetchOpinetStationDetail,
  fetchOpinetStationsAround,
} from '../services/opinet/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

export async function handleOpinetAveragePrices(c: ApiContext) {
  try {
    const result = await fetchOpinetAveragePrices({
      apiKey: c.env?.OPINET_API_KEY,
      timeoutMs: parseInteger(c.req.query('timeoutMs')),
    });
    return successResponse(c, result, { total: result.count, page: 1, pageSize: result.count });
  } catch (error) {
    return errorResponse(c, 'OPINET_AVERAGE_FAILED', getErrorMessage(error), 500);
  }
}

export async function handleOpinetLowestStations(c: ApiContext) {
  try {
    const result = await fetchOpinetLowestStations(
      {
        fuelCode: c.req.query('fuelCode') || c.req.query('prodcd'),
        areaCode: c.req.query('areaCode') || c.req.query('area'),
        count: parseInteger(c.req.query('count') || c.req.query('cnt')),
      },
      {
        apiKey: c.env?.OPINET_API_KEY,
        timeoutMs: parseInteger(c.req.query('timeoutMs')),
      },
    );
    return successResponse(c, result, { total: result.count, page: 1, pageSize: result.count });
  } catch (error) {
    return errorResponse(c, 'OPINET_LOWEST_FAILED', getErrorMessage(error), 500);
  }
}

export async function handleOpinetStationsAround(c: ApiContext) {
  const x = parseNumber(c.req.query('x'));
  const y = parseNumber(c.req.query('y'));
  const latitude = parseNumber(c.req.query('latitude') || c.req.query('lat'));
  const longitude = parseNumber(c.req.query('longitude') || c.req.query('lng'));
  const location = c.req.query('location') || c.req.query('keyword') || '';
  const hasKatec = x !== undefined && y !== undefined;
  const hasCoordinates = latitude !== undefined && longitude !== undefined;
  const hasLocation = location.trim().length > 0;

  if (!hasKatec && !hasCoordinates && !hasLocation) {
    return errorResponse(
      c,
      'MISSING_LOCATION',
      'KATEC x/y, 위도/경도(lat/lng), 또는 location 중 하나를 입력해주세요.',
    );
  }

  try {
    const result = await fetchOpinetStationsAround(
      {
        x,
        y,
        latitude,
        longitude,
        location,
        radiusMeters: parseInteger(c.req.query('radiusMeters') || c.req.query('radius')),
        fuelCode: c.req.query('fuelCode') || c.req.query('prodcd'),
        sort: c.req.query('sort'),
      },
      {
        apiKey: c.env?.OPINET_API_KEY,
        googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        timeoutMs: parseInteger(c.req.query('timeoutMs')),
      },
    );
    return successResponse(c, result, { total: result.count, page: 1, pageSize: result.count });
  } catch (error) {
    return errorResponse(c, 'OPINET_AROUND_FAILED', getErrorMessage(error), 500);
  }
}

export async function handleOpinetStationDetail(c: ApiContext) {
  const stationId = c.req.query('stationId') || c.req.query('id') || '';
  if (!stationId.trim()) {
    return errorResponse(c, 'MISSING_STATION_ID', 'stationId 또는 id를 입력해주세요.');
  }

  try {
    const result = await fetchOpinetStationDetail(stationId, {
      apiKey: c.env?.OPINET_API_KEY,
      timeoutMs: parseInteger(c.req.query('timeoutMs')),
    });
    return successResponse(c, result, { total: result.station ? 1 : 0, page: 1, pageSize: result.station ? 1 : 0 });
  } catch (error) {
    return errorResponse(c, 'OPINET_DETAIL_FAILED', getErrorMessage(error), 500);
  }
}
