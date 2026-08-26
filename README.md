# indian-rail-mcp

Indian Railways data from **official sources**, as a typed TypeScript library and an MCP server.

No API key. No third-party data vendor. No npm middleman that can disappear.

| | |
|---|---|
| **NTES** — `enquiry.indianrail.gov.in` | train schedules, live running status, coach position, trains between stations, live station boards |
| **IRCTC** — `www.irctc.co.in` | PNR status, coach-by-coach and berth-level seat availability |

---

## Why this exists

The popular `irctc-connect` package is deprecated. Its author renamed it to `railkit` and moved it behind a
signup and API key, and the free backends it depended on (`bookmytrain.vercel.app`, `easy-rail.onrender.com`)
now return 404 and 500. Anything still working in that ecosystem leans on a scrape of a third-party site using
a credential lifted from that site's own markup.

This library goes straight to the sources Indian Railways actually operates.

---

## Install

```bash
npm install indian-rail-mcp
```

Requires Node 20+. The only runtime dependency is `cheerio`.

## Library

```ts
import {
  getTrainInfo,
  trackTrain,
  searchTrainsBetweenStations,
  getLiveStation,
  getSeatAvailability,
  checkPnrStatus
} from "indian-rail-mcp";

// Full schedule and route
const info = await getTrainInfo("12951");
// -> { trainName: "NDLS TEJAS RAJ", type: "RAJDHANI", runsOn: "Daily",
//      classes: ["1A","2A","3A"], route: [ { stationCode: "MMCT", departure: "17:00", ... }, ... ] }

// Where is it right now (defaults to the journey in progress)
const live = await trackTrain("12626");
// -> { journeyDate, summary: "Arrived at BUTI BORI(BTBR) at 13:27 26-Aug",
//      stops: [...], coachPosition: [ { position: 0, coach: "ENG", classCode: "ENG" }, ... ] }

// Direct trains between two stations — code or full name
await searchTrainsBetweenStations("CAN", "PAY");
await searchTrainsBetweenStations("NEW DELHI", "MMCT");

// Next couple of hours at a station, with delay and platform
await getLiveStation("NDLS");

// Reservation chart: per-coach vacancy, plus berth detail when a class is given
await getSeatAvailability({ trainNumber: "12951", boardingStation: "MMCT", travelClass: "3A" });
```

Stations accept **either a code or a full name** — `NDLS` and `NEW DELHI` both work, resolved against NTES's own
8,700-station catalogue. Dates accept `DD-MM-YYYY`, `DD-MMM-YYYY` or `YYYY-MM-DD`.

### Errors

Every failure is a typed `RailError`:

| Class | `code` | Meaning |
|---|---|---|
| `InvalidInputError` | `INVALID_INPUT` | Bad station, train number or date — caught locally, before any network call |
| `NtesError` | `NTES_ERROR` | NTES returned an `ERR<nnn>` page |
| `IrctcError` | `IRCTC_ERROR` | IRCTC returned an `errorMessage` |
| `UpstreamError` | `UPSTREAM_ERROR` | Network failure or unparseable response |

> **On `ERR000`:** NTES returns the *same* generic `ERR000` page for malformed input as it does for a genuine
> outage. This library therefore validates station codes against the catalogue **before** calling NTES, so your
> own typo can never be reported to you as "the railway service is down". `NtesError` deliberately names both
> possibilities rather than claiming an outage.

## MCP server

Six tools: `getTrainInfo`, `trackTrain`, `searchTrainBetweenStations`, `getLiveStation`,
`getSeatAvailability`, `checkPnrStatus`.

```ts
import { createRailMcpServer } from "indian-rail-mcp/mcp";

const server = createRailMcpServer({ allowPnr: true });
await server.connect(yourTransport);
```

### Deploy to Vercel

```bash
vercel deploy
```

`vercel.json` pins the function to **`bom1` (Mumbai)** — both upstreams are in India, and that is worth far more
than it looks: warm requests run in ~124 ms versus ~885 ms cold, and Indian traffic from Indian egress IPs is much
less likely to trip the F5 WAF in front of NTES.

Environment:

| Variable | Purpose |
|---|---|
| `RAIL_API_KEY` | Required to enable `checkPnrStatus`. Callers send it as `x-api-key`. |
| `RATE_LIMIT_PER_MINUTE` | Per-IP request cap. Default 30. |

Point any MCP client at `https://<your-deployment>/api/mcp` using **Streamable HTTP** transport.

---

## PNR and personal data

`checkPnrStatus` returns **passenger personal data** — names, ages, gender, coach and berth.

- It is **disabled unless `RAIL_API_KEY` is set and matched**. It fails closed.
- The library never logs, caches or persists PNR responses.
- There are deliberately **no batch or enumeration helpers**. One PNR per call, by design.

If you deploy this publicly, keep it that way. Please don't build a PNR scraper.

---

## Data source and terms

All data is the property of **Indian Railways**, served by the **Centre for Railway Information Systems (CRIS)**.
This project is not affiliated with, endorsed by, or supported by Indian Railways, CRIS or IRCTC.

Read this before deploying:

- The [NTES Terms and Conditions](https://enquiry.indianrail.gov.in/mntes/disclaimerDisplay.html) permit
  downloading extracts **for personal use**, and state that you may not use "any software program" to
  systematically build a database from the site, nor include its pages in "any public or private electronic
  retrieval system or service", **without prior written permission**. They also state that railway data
  "should not be used for commercial purpose".
- CRIS grants that permission on request: *"Material featured on this Website may be reproduced free of charge
  after taking proper permission by sending a mail to us."* A ready-to-send request is in
  [`PERMISSION-REQUEST.md`](./PERMISSION-REQUEST.md).
- **Permission status for this project: requested, pending.**
- IRCTC's terms are stricter, and PNR data is personal data.

Data accuracy is best-effort and not guaranteed — NTES's own disclaimer says the same. Do not rely on it for
anything safety-critical; verify with the railways directly.

Be a good citizen: the defaults cache what is stable, rate-limit by IP, and reuse a single upstream session.
Please don't remove those.

---

## Development

```bash
npm install
npm test          # parser regression tests against recorded fixtures — no network
npm run smoke     # live end-to-end check against NTES and IRCTC
npm run test:mcp  # drives the MCP handler locally: handshake, tools, auth, rate limit
npm run fixtures  # re-record fixtures when upstream markup changes
npm run build
```

Fixtures in `test/fixtures/` are recorded HTML/JSON. When CRIS changes their markup, `npm test` fails with a
specific assertion instead of the tools quietly returning empty results.

## Licence

MIT — see [LICENSE](./LICENSE). The licence covers this source code only, not the underlying railway data.
