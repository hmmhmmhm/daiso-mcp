/**
 * 메가박스 API 클라이언트
 */

import { MEGABOX_API } from './api.js';
import type {
  MegaboxBookingListResponse,
  MegaboxMovie,
  MegaboxShowtime,
  MegaboxTheater,
  MegaboxTheaterInfo,
} from './types.js';
import { formatTime, toNumber, toYyyymmdd } from '../../utils/format.js';
import { createTimeoutController } from '../../utils/http.js';

interface FetchBookingListParams {
  playDate: string;
  movieId?: string;
  theaterId?: string;
  areaCode?: string;
  timeout?: number;
}

export async function fetchMegaboxBookingList(
  params: FetchBookingListParams,
): Promise<{ theaters: MegaboxTheater[]; movies: MegaboxMovie[]; showtimes: MegaboxShowtime[] }> {
  const { timeout = 15000 } = params;
  const form = new URLSearchParams({
    playDe: params.playDate,
    sellChnlCd: 'ONLINE',
    brchNoListCnt: '1',
    areaCd1: params.areaCode || '11',
    spclbYn1: 'N',
    theabKindCd1: '',
  });

  if (params.movieId) {
    form.set('arrMovieNo', params.movieId);
  }

  if (params.theaterId) {
    form.set('brchNo1', params.theaterId);
  }

  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const response = await fetch(`${MEGABOX_API.BASE_URL}${MEGABOX_API.SELECT_BOOKING_LIST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`메가박스 상영 목록 조회 실패: ${response.status}`);
    }

    const body = (await response.json()) as MegaboxBookingListResponse;

    const theaters = (body.areaBrchList || [])
      .filter((item) => item.brchNo && item.brchNm)
      .map((item) => ({
        theaterId: item.brchNo as string,
        theaterName: item.brchNm as string,
      }));

    const movies = (body.movieList || [])
      .filter((item) => item.movieNo && item.movieNm)
      .map((item) => ({
        movieId: item.movieNo as string,
        movieName: item.movieNm as string,
        movieStatus: item.movieStatCdNm || undefined,
      }));

    const showtimes = (body.movieFormList || [])
      .filter((item) => item.playSchdlNo && item.movieNo && item.brchNo)
      .map((item) => ({
        scheduleId: item.playSchdlNo as string,
        movieId: item.movieNo as string,
        movieName: item.movieNm || '',
        theaterId: item.brchNo as string,
        theaterName: item.brchNm || '',
        playDate: item.playDe || params.playDate,
        startTime: formatTime(item.playStartTime),
        endTime: formatTime(item.playEndTime),
        totalSeats: toNumber(item.totSeatCnt),
        remainingSeats: toNumber(item.restSeatCnt),
      }));

    return {
      theaters,
      movies,
      showtimes,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('메가박스 상영 목록 조회 시간 초과');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCoordinates(html: string): { latitude: number | null; longitude: number | null } {
  const latMatch = html.match(/(?:lat=|mapLat\s*[:=]\s*["']?)(-?\d+\.\d+)/i);
  const lngMatch = html.match(/(?:lng=|mapLng\s*[:=]\s*["']?)(-?\d+\.\d+)/i);

  return {
    latitude: latMatch ? parseFloat(latMatch[1]) : null,
    longitude: lngMatch ? parseFloat(lngMatch[1]) : null,
  };
}

function parseAddress(html: string): string {
  const roadAddressMatch = html.match(/도로명주소<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  if (roadAddressMatch) {
    return roadAddressMatch[1].trim();
  }

  const addressMatch = html.match(/주소<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  if (addressMatch) {
    return addressMatch[1].trim();
  }

  return '';
}

export async function fetchMegaboxTheaterInfo(
  theaterId: string,
  timeout = 15000,
): Promise<MegaboxTheaterInfo> {
  const form = new URLSearchParams({
    brchNo: theaterId,
  });

  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const response = await fetch(`${MEGABOX_API.BASE_URL}${MEGABOX_API.THEATER_INFO_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`메가박스 지점 정보 조회 실패: ${response.status}`);
    }

    const html = await response.text();
    const coordinates = parseCoordinates(html);
    const address = parseAddress(html);

    return {
      theaterId,
      address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('메가박스 지점 정보 조회 시간 초과');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { toYyyymmdd };
