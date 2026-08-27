# indian-rail-mcp

Indian Railways data from **official sources**, as an MCP server and a typed TypeScript library.

No API key. No third-party data vendor. No npm middleman that can disappear.

| Source | What it provides |
|---|---|
| **NTES** — `enquiry.indianrail.gov.in` | train schedules, live running status, coach position, trains between stations, live station boards |
| **IRCTC** — `www.irctc.co.in` | PNR status, coach-by-coach and berth-level seat availability |

---

## Quick start

```json
{
  "mcpServers": {
    "indian-rail": {
      "command": "npx",
      "args": ["-y", "indian-rail-mcp"]
    }
  }
}
```

That is the **stdio** build: your MCP client launches it as a subprocess on your own machine. It is the
recommended way to run this, and the only way all six tools work — see
[Why stdio](#why-stdio-and-not-the-hosted-url).

Requires Node 20+.

---

## Why this exists

The popular `irctc-connect` package is deprecated. Its author renamed it to `railkit` and moved it behind a
signup and API key, and the free backends it depended on (`bookmytrain.vercel.app`, `easy-rail.onrender.com`)
now return 404 and 500. Anything still working in that ecosystem leans on a scrape of a third-party site using
a credential lifted from that site's own markup.

This library goes straight to the sources Indian Railways actually operates.

---

## Two ways to run

|  | **stdio** (recommended) | **HTTP** (hosted) |
|---|---|---|
| Tools working | **6 of 6** | 4 of 6 |
| Setup | client spawns a subprocess | point at a URL |
| Who installs anything | each user | nobody |
| PNR data leaves your machine | **never** | passes through the server |
| Shareable link | no | yes |

A hosted demo runs at **https://indian-rail-mcp.vercel.app** — landing page, with the MCP endpoint at
`/api/mcp` and health at `/api/health`.

```json
{
  "mcpServers": {
    "indian-rail": {
      "type": "http",
      "url": "https://indian-rail-mcp.vercel.app/api/mcp"
    }
  }
}
```

---

## Tools

| Tool | Arguments | stdio | HTTP |
|---|---|:---:|:---:|
| `getTrainInfo` | `trainNumber` | ✅ | ✅ |
| `trackTrain` | `trainNumber`, `date?` | ✅ | ✅ |
| `searchTrainBetweenStations` | `fromStation`, `toStation` | ✅ | ✅ |
| `getLiveStation` | `stationCode` | ✅ | ✅ |
| `getSeatAvailability` | `trainNumber`, `boardingStation`, `date?`, `travelClass?` | ✅ | ❌ |
| `checkPnrStatus` | `pnr` | ✅ | ❌ |

Station arguments accept **either a code or a full name** — `NDLS` and `NEW DELHI` both work, resolved against
NTES's own 8,747-station catalogue. Dates accept `DD-MM-YYYY`, `DD-MMM-YYYY` or `YYYY-MM-DD`.

`trackTrain` defaults to the journey **currently in progress**, not the newest one listed — NTES lists
tomorrow's run first, which has not departed and is rarely what you meant.

---

## Why stdio, and not the hosted URL

**IRCTC's edge blocks datacenter traffic.** The same request, byte-identical headers, seconds apart:

```
your machine    OK    18 coaches | chart=true | 51 vacant berths listed
Vercel (bom1)   403   Access Denied — "You don't have permission to access
                      /online-charts/api/trainComposition on this server"
```

Nothing in the code differs. It is an edge decision about where the request came from, and header-fiddling does
not change it. NTES has no such restriction, which is why four tools work everywhere and two do not.

Run over stdio and the requests originate from your own machine, so all six work. That is also the better
privacy outcome: PNR responses never touch anyone's server.

---

## Library

The core is framework-agnostic — useful without MCP at all.

```ts
import {
  getTrainInfo,
  trackTrain,
  searchTrainsBetweenStations,
  getLiveStation,
  getSeatAvailability,
  checkPnrStatus
} from "indian-rail-mcp";

const info = await getTrainInfo("12951");
// { trainName: "NDLS TEJAS RAJ", type: "RAJDHANI", runsOn: "Daily",
//   classes: ["1A","2A","3A"], route: [ { stationCode: "MMCT", departure: "17:00", ... } ] }

const live = await trackTrain("12626");
// { journeyDate, summary: "Departed from WARORA(WRR) at 14:18 27-Aug",
//   stops: [...], coachPosition: [ { position: 0, coach: "ENG", classCode: "ENG" }, ... ] }

await searchTrainsBetweenStations("NEW DELHI", "MMCT");
await getLiveStation("NDLS");
await getSeatAvailability({ trainNumber: "12951", boardingStation: "MMCT", travelClass: "3A" });
```

### Reading seat availability

`totalVacant: 0` alongside 51 listed berths is not a contradiction. The per-coach count is berths free for the
**whole** journey; the listed berths are free on **segments** — berth 68 in B1 empty only from KOTA to NDLS,
berth 31 in B11 only from MMCT to SURAT. Segment vacancy is what current booking and TTE allocation run on.

Check `chartPrepared` before treating any of it as final. Chart data exists only after chart preparation,
typically about four hours before departure.

### Errors

Every failure is a typed `RailError`:

| Class | `code` | Meaning |
|---|---|---|
| `InvalidInputError` | `INVALID_INPUT` | Bad station, train number or date — caught locally, before any network call |
| `NtesError` | `NTES_ERROR` | NTES returned an `ERR<nnn>` page |
| `IrctcError` | `IRCTC_ERROR` | IRCTC returned an `errorMessage`, or a bot-protection page |
| `UpstreamError` | `UPSTREAM_ERROR` | Network failure or unparseable response |

> **On `ERR000`:** NTES returns the *same* generic `ERR000` page for malformed input as for a genuine outage.
> This library therefore validates station codes against the catalogue **before** calling NTES, so your own typo
> can never be reported back to you as "the railway service is down". `NtesError` names both possibilities
> rather than claiming an outage it cannot confirm.

---

## PNR and personal data

`checkPnrStatus` returns **passenger personal data** — names, ages, gender, coach and berth.

- On **stdio** it needs no key: the only caller is whoever launched the process.
- On **HTTP** it is disabled unless `RAIL_API_KEY` is set and matched. It fails closed.
- Responses are never logged, cached or persisted.
- There are deliberately **no batch or enumeration helpers**. One PNR per call, by design.

If you self-host publicly, please keep it that way.

---

## Self-hosting the HTTP server

```bash
vercel deploy
```

`vercel.json` pins the function to **`bom1` (Mumbai)** — both upstreams are in India, and warm requests run in
~250 ms there against ~900 ms cold from further away.

| Variable | Purpose |
|---|---|
| `RAIL_API_KEY` | Enables `checkPnrStatus`. Generate your own (`openssl rand -hex 32`) — it is not issued by anyone. Callers send it as `x-api-key`. |
| `RATE_LIMIT_PER_MINUTE` | Per-IP request cap. Default 30. |

The two IRCTC tools will still be refused from a datacenter, whoever hosts it.

> **Note for contributors:** files in `api/` import from `../dist/`, not `../src/`. Vercel compiles `api/` with
> its own tsc settings, which do not rewrite `.ts` import specifiers — so a `.ts` path survives into the emitted
> JavaScript and the function dies with `ERR_MODULE_NOT_FOUND`. `npm run verify:vercel` compiles `api/` the way
> Vercel does and then *runs* the result, which is the only way that class of bug shows up before production.

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
  after taking proper permission by sending a mail to us."* A ready-to-send request, and the address to send it
  to, are in [`PERMISSION-REQUEST.md`](./PERMISSION-REQUEST.md).
- **Permission status: not yet requested.**

Data accuracy is best-effort and not guaranteed — NTES's own disclaimer says the same. Do not rely on it for
anything safety-critical. For official enquiries, dial **139**.

Be a good citizen: the defaults cache what is stable, rate-limit by IP, and reuse a single upstream session.
Please don't remove those.

---

## Development

```bash
npm install

npm test                     # parser regression tests against recorded fixtures — no network
npm run smoke                # live end-to-end check against NTES and IRCTC
npm run test:mcp             # drives the HTTP handler: handshake, tools, auth gate, rate limit
node test/stdio-client.mjs   # spawns the stdio server and speaks MCP to it as a real client
npm run verify:vercel        # compiles api/ the way Vercel does, then runs it
npm run dev                  # local server: landing page + /api/mcp + /api/health
npm run fixtures             # re-record fixtures when upstream markup changes
npm run build
```

Fixtures in `test/fixtures/` are recorded HTML and JSON. When CRIS changes their markup, `npm test` fails with a
specific assertion instead of the tools quietly returning empty results.

### Layout

```
src/core/   NTES + IRCTC clients, parsers, station catalogue — no MCP
src/mcp/    tool definitions; stdio.ts and server.ts entry points
api/        Vercel Web Handlers (mcp.ts, health.ts)
public/     landing page for the hosted deployment
```

Runtime dependencies: `cheerio`. That is the whole list. `@modelcontextprotocol/sdk` and `zod` are optional
peers, needed only for the MCP entry points.

## Licence

MIT — see [LICENSE](./LICENSE). The licence covers this source code only, not the underlying railway data.
