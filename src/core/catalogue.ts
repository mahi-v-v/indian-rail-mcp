import { InvalidInputError, UpstreamError } from "./errors.ts";
import { ntesAsset } from "./ntes/client.ts";
import type { Station, TrainSummary } from "./types.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Cached<T> {
	value: T;
	at: number;
}

let stationCache: Cached<Station[]> | null = null;
let trainCache: Cached<TrainSummary[]> | null = null;

const fresh = <T>(c: Cached<T> | null): c is Cached<T> =>
	c !== null && Date.now() - c.at < CACHE_TTL_MS;

/**
 * NTES publishes its own station list as a static JS file:
 *   var arrStationList = [{"code":"AA","name":"ATARIA"}, ...];
 * Strip the assignment and it is plain JSON. ~8,700 entries.
 */
export async function getStations(): Promise<Station[]> {
	if (fresh(stationCache)) return stationCache.value;

	const js = await ntesAsset(`javascripts/station_data.js?v=${Date.now()}`);
	const json = js.replace(/^\s*var\s+arrStationList\s*=\s*/, "").replace(/;\s*$/, "");

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new UpstreamError(
			"Could not parse the NTES station catalogue; its format may have changed."
		);
	}
	if (!Array.isArray(parsed)) {
		throw new UpstreamError("NTES station catalogue was not a list.");
	}

	const stations = (parsed as Station[]).filter(
		(s) => typeof s?.code === "string" && typeof s?.name === "string"
	);
	stationCache = { value: stations, at: Date.now() };
	return stations;
}

/**
 * The train catalogue is a plain string array of "12951- NDLS TEJAS RAJ".
 * ~10,700 entries.
 */
export async function getTrains(): Promise<TrainSummary[]> {
	if (fresh(trainCache)) return trainCache.value;

	const js = await ntesAsset(`javascripts/train_data.js?v=${Date.now()}`);
	const body = js.replace(/^\s*var\s+arrTrainList\s*=\s*/, "").replace(/;\s*$/, "");

	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new UpstreamError(
			"Could not parse the NTES train catalogue; its format may have changed."
		);
	}
	if (!Array.isArray(parsed)) {
		throw new UpstreamError("NTES train catalogue was not a list.");
	}

	const trains: TrainSummary[] = [];
	for (const entry of parsed as string[]) {
		if (typeof entry !== "string") continue;
		const dash = entry.indexOf("-");
		if (dash < 0) continue;
		trains.push({
			number: entry.slice(0, dash).trim(),
			name: entry.slice(dash + 1).trim()
		});
	}
	trainCache = { value: trains, at: Date.now() };
	return trains;
}

/**
 * Resolve a user-supplied station (code or name) to a canonical code.
 *
 * This runs before every NTES station query on purpose. NTES answers malformed
 * station input with the same generic ERR000 page it uses for a real outage, so
 * validating here is what keeps "you typed a bad code" from being reported as
 * "the railway service is down".
 */
export async function resolveStation(input: string): Promise<Station> {
	const raw = input.trim();
	if (!raw) throw new InvalidInputError("Station code or name is required.");

	// "NEW DELHI - NDLS" / "NDLS - NEW DELHI" — take whichever side is a code.
	const parts = raw.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
	const stations = await getStations();
	const byCode = new Map(stations.map((s) => [s.code.toUpperCase(), s]));

	for (const part of [raw, ...parts]) {
		const hit = byCode.get(part.toUpperCase());
		if (hit) return hit;
	}

	const upper = raw.toUpperCase();
	const exactName = stations.find((s) => s.name.toUpperCase() === upper);
	if (exactName) return exactName;

	const partialName = stations.filter((s) => s.name.toUpperCase().includes(upper));
	if (partialName.length === 1 && partialName[0]) return partialName[0];
	if (partialName.length > 1) {
		const shown = partialName
			.slice(0, 8)
			.map((s) => `${s.code} (${s.name})`)
			.join(", ");
		throw new InvalidInputError(
			`"${raw}" matches ${partialName.length} stations. Be more specific — did you mean: ${shown}?`
		);
	}

	throw new InvalidInputError(
		`Unknown station "${raw}". Use an Indian Railways station code such as NDLS, MMCT or HWH.`
	);
}

/** Look up trains by number or (partial) name. */
export async function findTrains(query: string): Promise<TrainSummary[]> {
	const raw = query.trim().toUpperCase();
	if (!raw) throw new InvalidInputError("Train number or name is required.");

	const trains = await getTrains();
	const exact = trains.filter((t) => t.number === raw);
	if (exact.length) return exact;
	return trains.filter((t) => t.name.toUpperCase().includes(raw)).slice(0, 25);
}

/** Confirm a 5-digit train number exists in NTES's catalogue. */
export async function resolveTrain(trainNumber: string): Promise<TrainSummary> {
	const num = trainNumber.trim();
	if (!/^\d{5}$/.test(num)) {
		throw new InvalidInputError(
			`"${trainNumber}" is not a train number. Indian Railways train numbers are exactly 5 digits, e.g. 12951.`
		);
	}
	const trains = await getTrains();
	const hit = trains.find((t) => t.number === num);
	if (hit) return hit;
	// Catalogue lags new/special trains — allow the query, let NTES decide.
	return { number: num, name: "" };
}

/** Test seam: drop cached catalogues. */
export function clearCatalogueCache(): void {
	stationCache = null;
	trainCache = null;
}
