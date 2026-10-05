import { expect, test } from 'vitest';
import { toSeatCount, toNumber } from '../../../src/utils/format.js';

test.each([0, '0', ' 0 ', 17, '17'])('preserves valid seat count %j', (value) => {
  expect(toSeatCount(value)).toBe(Number(value));
});
test.each([null, undefined, '', ' ', 'unknown', '17seats', true, {}, -1, 1.5, NaN, Infinity])(
  'rejects unavailable seat count %j',
  (value) => {
    expect(toSeatCount(value)).toBeNull();
  },
);

test('retains non-seat numeric conversion behavior', () => {
  expect(toNumber(12)).toBe(12);
  expect(toNumber('bad')).toBe(0);
});
