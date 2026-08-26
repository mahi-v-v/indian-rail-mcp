/**
 * indian-rail-mcp — core library.
 *
 * Framework-agnostic access to Indian Railways data from official sources:
 *   - NTES  (enquiry.indianrail.gov.in) — schedules, live running, station boards
 *   - IRCTC (www.irctc.co.in)           — PNR status, berth-level availability
 *
 * Data is the property of Indian Railways / CRIS. See README for attribution
 * and terms. PNR responses contain passenger personal data — do not log,
 * persist, or batch them.
 */

import { getPnrStatus as fetchPnr, getTrainComposition, getVacantBerths } from "./irctc/client.ts";
import { ntesNavigate, ntesPost, resetSession } from "./ntes/client.ts";
import {
	parseLiveStation,
	parseRunningStatus,
	parseSchedule,
	parseTrainsBetween
} from "./ntes/parse.ts";
import { resolveStation, resolveTrain } from "./catalogue.ts";
import { parseDate, toIsoDate, toNtesDate, today } from "./dates.ts";
import { InvalidInputError } from "./errors.ts";
import { memo, TTL } from "./cache.ts";
import type {
	LiveStationBoard,
	SeatAvailability,
	TrainBetweenStations,
	TrainInfo,
	TrainRunning
} from "./types.ts";

export * from "./types.ts";
export * from "./errors.ts";
export {
	findTrains,
	getStations,
	getTrains,
	resolveStation,
	clearCatalogueCache
} from "./catalogue.ts";
export { resetSession };
export { clearResponseCache } from "./cache.ts";

/** Full schedule and route for a train. */
export async function getTrainInfo(trainNumber: string): Promise<TrainInfo> {
	const train = await resolveTrain(trainNumber);
	return memo(`schedule:${train.number}`, TTL.schedule, async () => {
		const html = await ntesPost("q?opt=TrainServiceSchedule&subOpt=show", {
			lan: "en",
			trainNo: train.number,
			appLang: "en"
		});
		const info = parseSchedule(html, train.number);
		if (!info.route.length) {
			throw new InvalidInputError(
				`NTES returned no route for train ${train.number}. Check the train number is correct and currently in service.`
			);
		}
		return info;
	});
}

/**
 * Live running status for a train.
 *
 * NTES returns every currently-tracked journey date in one response; `date`
 * selects which one to report, defaulting to the most recent.
 */
export async function trackTrain(
	trainNumber: string,
	date?: string
): Promise<TrainRunning> {
	const train = await resolveTrain(trainNumber);
	const html = await ntesPost("tr?opt=TrainRunning&subOpt=FindRunningInstance", {
		lan: "en",
		trainNo: train.number,
		appLang: "en"
	});

	// Panes are keyed by a lowercase "27-aug-2026" fragment.
	const preferred = date ? toNtesDate(parseDate(date)).toLowerCase() : undefined;
	const running = parseRunningStatus(html, train.number, preferred);

	if (date && running.journeyDate) {
		const wanted = toNtesDate(parseDate(date)).toLowerCase();
		if (running.journeyDate.toLowerCase() !== wanted) {
			const offered = running.availableInstances.map((i) => i.label).join(", ");
			throw new InvalidInputError(
				`NTES is not tracking train ${train.number} on ${date}. ` +
					(offered ? `Available journey dates: ${offered}.` : "No journey dates are currently listed.")
			);
		}
	}
	return running;
}

/** Direct trains between two stations. */
export async function searchTrainsBetweenStations(
	fromStation: string,
	toStation: string
): Promise<TrainBetweenStations[]> {
	const [from, to] = await Promise.all([
		resolveStation(fromStation),
		resolveStation(toStation)
	]);

	if (from.code === to.code) {
		throw new InvalidInputError(
			`Origin and destination are the same station (${from.code}).`
		);
	}

	return memo(`tbs:${from.code}:${to.code}`, TTL.trainsBetween, async () => {
		await ntesNavigate("tbs");
		// Bare codes only. NTES answers a "NAME - CODE" ordering with a generic
		// ERR000 page that is indistinguishable from an outage.
		const html = await ntesPost("q?opt=TrainsBetweenStation&subOpt=tbs", {
			lan: "en",
			jFromStationInput: from.code,
			jToStationInput: to.code
		});
		return parseTrainsBetween(html);
	});
}

/** Trains arriving at or departing from a station in the next couple of hours. */
export async function getLiveStation(
	stationCode: string
): Promise<LiveStationBoard> {
	const station = await resolveStation(stationCode);
	await ntesNavigate("liveStation");
	const html = await ntesPost("q?opt=LiveStation&subOpt=show", {
		lan: "en",
		jFromStationInput: station.code,
		jToStationInput: ""
	});
	const board = parseLiveStation(html, station.code);
	return { ...board, stationName: board.stationName ?? station.name };
}

/**
 * PNR status.
 *
 * Returns IRCTC's response as-is. It contains passenger personal data — treat
 * it as such: one lookup at a time, never logged or stored.
 */
export async function checkPnrStatus(
	pnr: string
): Promise<Record<string, unknown>> {
	const clean = pnr.replace(/\s|-/g, "");
	if (!/^\d{10}$/.test(clean)) {
		throw new InvalidInputError(
			`"${pnr}" is not a PNR number. A PNR is exactly 10 digits.`
		);
	}
	return fetchPnr(clean);
}

const TRAVEL_CLASSES = new Set([
	"1A",
	"2A",
	"3A",
	"3E",
	"CC",
	"EC",
	"SL",
	"2S",
	"FC"
]);

/**
 * Seat availability from IRCTC's reservation charts.
 *
 * Chart data only exists once the chart has been prepared (typically ~4 hours
 * before departure), so `chartPrepared` must be checked before reading
 * vacancies as authoritative.
 */
export async function getSeatAvailability(args: {
	trainNumber: string;
	boardingStation: string;
	date?: string;
	travelClass?: string;
}): Promise<SeatAvailability> {
	const train = await resolveTrain(args.trainNumber);
	const boarding = await resolveStation(args.boardingStation);
	const parsed = args.date ? parseDate(args.date) : today();
	const iso = toIsoDate(parsed);

	if (args.travelClass && !TRAVEL_CLASSES.has(args.travelClass.toUpperCase())) {
		throw new InvalidInputError(
			`"${args.travelClass}" is not a travel class. Use one of: ${[...TRAVEL_CLASSES].join(", ")}.`
		);
	}

	const composition = await getTrainComposition(train.number, iso, boarding.code);
	const coaches = (composition.cdd ?? []).map((c) => ({
		coachName: c.coachName,
		classCode: c.classCode,
		positionFromEngine: c.positionFromEngine,
		vacantBerths: c.vacantBerths
	}));

	const chartFlag = composition.chartStatusResponseDto?.chartOneFlag ?? 0;
	const chartPrepared = Boolean(composition.chartOneDate) && chartFlag > 0;

	const result: SeatAvailability = {
		trainNumber: train.number,
		trainName: composition.trainName ?? train.name ?? null,
		from: composition.from ?? null,
		to: composition.to ?? null,
		journeyDate: composition.trainStartDate ?? iso,
		boardingStation: boarding.code,
		remote: composition.remote ?? null,
		chartPrepared,
		chartPreparedAt: composition.chartOneDate ?? null,
		coaches,
		vacantBerths: [],
		totalVacant: coaches.reduce((sum, c) => sum + (c.vacantBerths ?? 0), 0)
	};

	if (!args.travelClass) return result;

	// Berth detail needs the remote/source/date values the chart service itself
	// reported — user-supplied equivalents are rejected.
	const berths = await getVacantBerths({
		trainNo: train.number,
		boardingStation: boarding.code,
		remoteStation: composition.remote ?? boarding.code,
		trainSourceStation: composition.from ?? boarding.code,
		journeyDateIso: composition.trainStartDate ?? iso,
		travelClass: args.travelClass.toUpperCase()
	});

	result.vacantBerths = (berths.vbd ?? []).map((b) => ({
		coachName: b.coachName,
		berthNumber: b.berthNumber,
		berthCode: b.berthCode,
		cabinCoupeNo: b.cabinCoupeNo ?? null,
		from: b.from,
		to: b.to
	}));
	return result;
}
