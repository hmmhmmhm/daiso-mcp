/**
 * 영화관 CLI 명령 핸들러
 */

import type { CliDeps } from '../types.js';
import { runApiCommand } from './apiCommand.js';

function applyKeywordPositional(parsed: { positionals: string[]; options: Record<string, string> }): null {
  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }
  return null;
}

export async function handleLottecinemaTheaters(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'lottecinema-theaters',
    options,
    deps,
    path: '/api/lottecinema/theaters',
    configure: applyKeywordPositional,
  });
}

export async function handleLottecinemaMovies(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'lottecinema-movies',
    options,
    deps,
    path: '/api/lottecinema/movies',
    configure: applyKeywordPositional,
  });
}

export async function handleLottecinemaSeats(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'lottecinema-seats',
    options,
    deps,
    path: '/api/lottecinema/seats',
    configure: applyKeywordPositional,
  });
}

export async function handleCgvTheaters(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'cgv-theaters',
    options,
    deps,
    path: '/api/cgv/theaters',
    configure: applyKeywordPositional,
  });
}

export async function handleCgvMovies(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'cgv-movies',
    options,
    deps,
    path: '/api/cgv/movies',
    configure: applyKeywordPositional,
  });
}

export async function handleCgvTimetable(options: string[], deps: CliDeps): Promise<number> {
  return await runApiCommand({
    command: 'cgv-timetable',
    options,
    deps,
    path: '/api/cgv/timetable',
    configure: applyKeywordPositional,
  });
}
