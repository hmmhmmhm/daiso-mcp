/**
 * 인터랙티브 CLI 공용 타입
 */

export type FetchLike = typeof fetch;
export type WriteFn = (message: string) => void;

export interface InteractiveCliDeps {
  fetchImpl: FetchLike;
  writeOut: WriteFn;
  writeErr: WriteFn;
  createPrompt?: () => InteractivePrompt;
}

export interface InteractivePrompt {
  ask: (question: string) => Promise<string>;
  close: () => void;
}

export interface InteractiveStore {
  name: string;
  address: string;
  phone: string;
}

export interface InteractiveTheater {
  theaterId: string;
  name: string;
  address: string;
  distanceKm: string;
}
