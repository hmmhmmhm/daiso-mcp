/**
 * CGV 시간표 후처리 유틸리티
 */

import type { CgvTimetable } from './types.js';

export function filterAndSortTimetable(
  timetable: CgvTimetable[],
  options: { theaterCode?: string; movieCode?: string; limit: number },
): CgvTimetable[] {
  const { theaterCode, movieCode, limit } = options;

  return timetable
    .filter((item) => (theaterCode ? item.theaterCode === theaterCode : true))
    .filter((item) => (movieCode ? item.movieCode === movieCode : true))
    .sort((a, b) => {
      if (a.startTime === b.startTime) {
        return a.theaterName.localeCompare(b.theaterName);
      }
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, limit);
}
