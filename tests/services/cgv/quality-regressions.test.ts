import { createSearchMoviesTool } from '../../../src/services/cgv/tools/searchMovies.js';
import { createListNowShowingTool } from '../../../src/services/megabox/tools/listNowShowing.js';
import {
  handleMegaboxGetRemainingSeats,
  handleMegaboxListNowShowing,
} from '../../../src/api/megaboxHandlers.js';
import assert from 'node:assert/strict';
import { test, afterEach } from 'vitest';
import { fetchCgvTimetable } from '../../../src/services/cgv/client.ts';
import { createGetTimetableTool } from '../../../src/services/cgv/tools/getTimetable.ts';
import { handleCgvGetTimetable } from '../../../src/api/cgvHandlers.ts';
import { createGetRemainingSeatsTool } from '../../../src/services/megabox/tools/getRemainingSeats.ts';
import { fetchMegaboxBookingList } from '../../../src/services/megabox/client.ts';
import { fetchLotteCinemaNowShowing } from '../../../src/services/lottecinema/client.ts';
import { fetchDtryxTimetable } from '../../../src/services/dtryx/client.ts';
import { searchNaverLocalPlaces } from '../../../src/services/places/client.ts';
import { fetchOpinetAveragePrices } from '../../../src/services/opinet/client.ts';

const originalFetch = globalThis.fetch;
const json = (body: unknown) => new Response(JSON.stringify(body));
const parseTool = (response: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(response.content[0].text!);
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('preserves numeric zero seats', async () => {
  // Every global fetch is replaced; no production request can escape.
  globalThis.fetch = async () =>
    json({
      data: [
        {
          siteNo: '0056',
          siteNm: 'fixture theater',
          movNo: 'OTHER',
          movNm: 'Other movie',
          scnYmd: '20261005',
          scnSseq: '1',
          frSeatCnt: 0,
          frtmpSeatCnt: 17,
          stcnt: 100,
        },
      ],
    });
  assert.equal(
    (await fetchCgvTimetable({ theaterCode: '0056', playDate: '20261005' }))[0].remainingSeats,
    0,
  );
});
test('CGV strict movie filter', async () => {
  globalThis.fetch = async () =>
    json({ data: [{ siteNo: '0056', movNo: 'OTHER', scnYmd: '20261005' }] });

  const args = { theaterCode: '0056', playDate: '20261005', movieCode: 'REQUESTED' };
  const mcp = parseTool(await createGetTimetableTool().handler(args));
  const rest = await handleCgvGetTimetable({
    req: { query: (key: keyof typeof args) => args[key] },
    env: {},
    json: (body: unknown, status?: number) => ({ body, status }),
  } as never);
  assert.equal(mcp.count, 0);
  assert.equal(
    (
      rest as unknown as {
        body: { success: boolean; data: { filterRelaxed: boolean; timetable: unknown[] } };
      }
    ).body.success,
    true,
  );
  assert.equal(
    (
      rest as unknown as {
        body: { success: boolean; data: { filterRelaxed: boolean; timetable: unknown[] } };
      }
    ).body.data.filterRelaxed,
    false,
  );
  assert.equal(
    (
      rest as unknown as {
        body: { success: boolean; data: { filterRelaxed: boolean; timetable: unknown[] } };
      }
    ).body.data.timetable.length,
    0,
  );
});
test('missing and malformed seats remain unknown', async () => {
  globalThis.fetch = async () =>
    json({
      movieFormList: [
        {
          playSchdlNo: '1',
          movieNo: 'M',
          brchNo: 'T',
          totSeatCnt: 100,
          restSeatCnt: 'unknown',
        },
      ],
    });
  assert.equal(
    (await fetchMegaboxBookingList({ playDate: '20261005' })).showtimes[0].remainingSeats,
    null,
  );
  const queue: unknown[] = [
    {
      IsOK: true,
      Cinemas: {
        Cinemas: {
          Items: [
            { CinemaID: 'T', CinemaNameKR: 'Fixture', DivisionCode: '1', DetailDivisionCode: '1' },
          ],
        },
      },
      Movies: { Movies: { Items: [{ RepresentationMovieCode: 'M', MovieNameKR: 'Movie' }] } },
    },
    {
      IsOK: true,
      PlaySeqs: {
        Items: [
          {
            CinemaID: 'T',
            RepresentationMovieCode: 'M',
            ScreenID: '1',
            PlaySequence: '1',
            TotalSeatCount: 100,
          },
        ],
      },
    },
  ];
  globalThis.fetch = async () => json(queue.shift());
  const lotte = (
    await fetchLotteCinemaNowShowing({ theaterId: 'T', movieId: 'M', playDate: '20261005' })
  ).showtimes[0];
  assert.equal(lotte.remainingSeats, null);
  assert.equal(lotte.bookedSeats, null);
  globalThis.fetch = async () =>
    json({
      RetCode: 'success',
      Recordset: [{ CinemaCd: 'C', MovieCd: 'M', ScreenCd: '1', TotalSeatCnt: 100 }],
    });
  const dtryx = (
    await fetchDtryxTimetable({ brandCode: 'etc', cinemaCode: 'C', playDate: '20261005' })
  )[0];
  assert.equal(dtryx.remainingSeats, null);
  assert.equal(dtryx.bookedSeats, null);
});
test('HTML upstream is an error', async () => {
  const offlineHtmlFetch: typeof fetch = async () => new Response('<html>maintenance</html>');
  await assert.rejects(
    searchNaverLocalPlaces({
      naverClientId: 'offline',
      naverClientSecret: 'offline',
      location: 'Fixture',
      fetchImpl: offlineHtmlFetch,
    }),
  );
  await assert.rejects(
    fetchOpinetAveragePrices({ apiKey: 'offline', fetchImpl: offlineHtmlFetch }),
  );
});
test('CGV rejects invalid input', async () => {
  globalThis.fetch = async () =>
    json({
      data: [1, 2, 3].map((n) => ({
        siteNo: 'T',
        movNo: 'M',
        scnYmd: '20261005',
        scnSseq: String(n),
        scnsrtTm: `1${n}00`,
      })),
    });
  await assert.rejects(
    createGetTimetableTool().handler({ theaterCode: 'T', playDate: 'garbage', limit: -1 }),
  );
});
test('Megabox unresolved location cannot broaden', async () => {
  const bookingBodies: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('selectBokdList')) {
      bookingBodies.push(String(options?.body));
      return json({
        areaBrchList: [{ brchNo: 'UNRELATED', brchNm: 'Fixture theater' }],
        movieFormList: [{ playSchdlNo: '1', movieNo: 'M', brchNo: 'UNRELATED', restSeatCnt: 50 }],
      });
    }
    if (String(url).includes('infoPage')) return new Response('<html>No coordinates</html>');
    throw new Error(`Unexpected offline request: ${String(url)}`);
  };
  await assert.rejects(
    createGetRemainingSeatsTool().handler({
      latitude: 35.1796,
      longitude: 129.0756,
      areaCode: '26',
      playDate: '20261005',
    }),
  );
  assert.equal(bookingBodies.length, 1);
});

test('lifestyle malformed envelopes fail while valid empty arrays succeed', async () => {
  for (const payload of [null, {}, { errorMessage: 'maintenance' }, { items: {} }]) {
    await assert.rejects(
      searchNaverLocalPlaces({
        naverClientId: 'offline',
        naverClientSecret: 'offline',
        keyword: 'Fixture',
        fetchImpl: async () => json(payload),
      }),
    );
  }
  const emptyPlaces = await searchNaverLocalPlaces({
    naverClientId: 'offline',
    naverClientSecret: 'offline',
    keyword: 'Fixture',
    fetchImpl: async () => json({ items: [], total: 0 }),
  });
  assert.equal(emptyPlaces.count, 0);
  for (const payload of [null, {}, { RESULT: {} }, { RESULT: { OIL: null } }, { OIL: 'error' }]) {
    await assert.rejects(
      fetchOpinetAveragePrices({ apiKey: 'offline', fetchImpl: async () => json(payload) }),
    );
  }
  const emptyOil = await fetchOpinetAveragePrices({
    apiKey: 'offline',
    fetchImpl: async () => json({ OIL: [] }),
  });
  assert.equal(emptyOil.count, 0);
});

for (const call of [
  (args: Record<string, string | number>) => createListNowShowingTool().handler(args),
  async (args: Record<string, string | number>) => {
    for (const handler of [handleMegaboxGetRemainingSeats, handleMegaboxListNowShowing]) {
      const result = await handler({
        req: {
          query: (key: string) =>
            ({
              lat: args.latitude,
              lng: args.longitude,
              areaCode: args.areaCode,
              playDate: args.playDate,
            })[key as 'lat']?.toString(),
        },
        env: {},
        json: (body: unknown, status: number) => ({ body, status }),
      } as never);
      assert.equal((result as unknown as { status: number }).status, 500);
    }
    throw new Error('resolved failure');
  },
]) {
  test('Megabox movie and REST resolution failures never request other theaters', async () => {
    let bookingCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes('selectBokdList')) {
        bookingCalls += 1;
        return json({ areaBrchList: [{ brchNo: 'OTHER', brchNm: 'Fixture' }] });
      }
      return new Response('<html>no coordinates</html>');
    };
    await assert.rejects(
      call({ latitude: 35.1796, longitude: 129.0756, areaCode: '26', playDate: '20261005' }),
    );
    assert.ok(bookingCalls <= 2);
  });
}

test('upstream HTTP errors retain status and raw message', async () => {
  for (const body of ['', JSON.stringify({})]) {
    const fetchImpl = async () => new Response(body, { status: 503 });
    await assert.rejects(fetchOpinetAveragePrices({ apiKey: 'offline', fetchImpl }), /HTTP 503/);
    await assert.rejects(
      searchNaverLocalPlaces({
        naverClientId: 'offline',
        naverClientSecret: 'offline',
        keyword: 'Fixture',
        fetchImpl,
      }),
    );
  }
});

test('CGV unresolved coordinates keep an empty requested scope', async () => {
  globalThis.fetch = async () => json({ data: [] });
  const args = { latitude: 37.5, longitude: 127, playDate: '20261005' };
  const result = parseTool(await createGetTimetableTool().handler(args));
  assert.equal(result.count, 0);
  assert.equal(parseTool(await createSearchMoviesTool().handler(args)).count, 0);
});

test('location helpers still reject coordinates outside Korea directly', async () => {
  const { resolveCgvLocation } = await import('../../../src/services/cgv/location.js');
  const { resolveMegaboxLocation } = await import('../../../src/services/megabox/location.js');
  await assert.rejects(resolveCgvLocation({ latitude: 0, longitude: 0 }));
  await assert.rejects(resolveMegaboxLocation({ latitude: 0, longitude: 0 }));
});

test('CGV nearby lookup preserves empty and equal-distance candidates', async () => {
  const { fetchCgvNearbyTheaters } = await import('../../../src/services/cgv/location.js');
  globalThis.fetch = async (url) =>
    String(url).includes('kakao')
      ? json({
          documents: [
            { place_name: 'CGV A', x: '127', y: '37.5' },
            { place_name: 'CGV B', x: '127', y: '37.5' },
            { x: '127', y: '37.5' },
          ],
        })
      : json({
          data: [
            {
              siteList: [
                { siteNo: 'A', siteNm: 'A' },
                { siteNo: 'B', siteNm: 'B' },
              ],
            },
          ],
        });
  assert.equal((await fetchCgvNearbyTheaters({ playDate: '20261005' })).count, 0);
  assert.equal(
    (
      await fetchCgvNearbyTheaters(
        { playDate: '20261005', latitude: 37.5, longitude: 127 },
        { kakaoRestApiKey: 'offline' },
      )
    ).count,
    2,
  );
});
