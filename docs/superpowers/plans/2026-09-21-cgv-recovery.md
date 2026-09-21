# CGV direct transport recovery implementation plan

**Goal:** Restore free direct CGV requests where the upstream accepts browser request headers.

**Architecture:** Keep the existing endpoint, HMAC signing, normalization and explicit upstream errors. Add only the browser User-Agent proven necessary by controlled live requests. Do not add paid proxy calls or return empty success for failures.

**Tech stack:** TypeScript, fetch, Web Crypto, Vitest.

## Evidence

2026-09-21 local Windows network, `GET https://api.cgv.co.kr/cnm/atkt/searchRegnList?coCd=A420`:

| Request variation | Result |
| --- | --- |
| Existing signed headers | Cloudflare HTTP 403 HTML |
| Same signature + full Chrome User-Agent + Origin + Referer | HTTP 200 JSON |
| Same signature + full Chrome User-Agent only | HTTP 200, statusCode 0, 9 regions, 176 theaters |
| Same signature + Origin + Referer only | HTTP 403 HTML |
| Same signature + generic Mozilla/5.0 only | HTTP 403 HTML |

The existing signing key and message format are accepted. This isolates the local failure to User-Agent-sensitive upstream filtering. It does not establish that Cloudflare Workers or GitHub Actions IPs are accepted with the same header.

## Tasks

- [x] Reproduce the failure and isolate the request-header variable with bounded direct requests.
- [x] Add a regression test to `tests/services/cgv/transport.test.ts` asserting the observed required header and successful JSON handling. Run it and verify it fails before implementation.
- [x] Add the measured browser User-Agent to `src/services/cgv/transport.ts` without changing signing or error handling.
- [x] Run `npx vitest run tests/services/cgv` and repeat direct theater/movie/timetable calls using production functions.
- [x] Record results and remaining environment limitations in `docs/cgv-network-analysis-result.md`.

No commits, pushes or deployments are part of this delegated change.

## Verification outcome

Regression test failed with HTTP 403 before the change. All 87 CGV tests then passed. Local production functions returned 176 theaters, 9 movies and 29 timetable entries. Cloudflare remote preview returned HTTP 200 and nonempty data for all three CGV app routes. No production deployment was performed.

Controlled Cloudflare remote preview test with unique `probe` query parameters (to avoid edge cache): temporarily removing User-Agent produced upstream HTTP 403 / app HTTP 503; restoring User-Agent produced HTTP 200 with 3 theaters. The initial same-URL cached response was excluded from this comparison. The source was restored and the 14 transport tests passed again.
