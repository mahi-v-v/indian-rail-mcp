import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as rail from "../core/index.ts";
import { RailError } from "../core/errors.ts";

/**
 * Station code: 2-5 letters.
 *
 * Note `.min(2).max(5)` rather than `.length(2)` — Zod's `.length(n)` means
 * EXACTLY n characters, which silently rejects every real code (NDLS, BCT, HWH)
 * and is the bug this library was written to replace.
 */
const stationCode = z
	.string()
	.trim()
	.min(2)
	.max(40)
	.describe(
		"Station code (e.g. NDLS, MMCT, HWH) or full station name (e.g. NEW DELHI)."
	);

const trainNumber = z
	.string()
	.trim()
	.regex(/^\d{5}$/, "Train number must be exactly 5 digits, e.g. 12951.")
	.describe("Five-digit Indian Railways train number, e.g. 12951.");

const journeyDate = z
	.string()
	.trim()
	.describe("Journey date as DD-MM-YYYY, e.g. 27-12-2026. Defaults to today.");

const ok = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
});

const fail = (err: unknown) => {
	const message =
		err instanceof RailError
			? err.message
			: err instanceof Error
				? err.message
				: String(err);
	const code = err instanceof RailError ? err.code : "UNKNOWN";
	return {
		isError: true,
		content: [
			{ type: "text" as const, text: JSON.stringify({ error: code, message }, null, 2) }
		]
	};
};

/** Wrap a handler so upstream failures become readable tool errors, never crashes. */
const guard =
	<A>(fn: (args: A) => Promise<unknown>) =>
	async (args: A) => {
		try {
			return ok(await fn(args));
		} catch (err) {
			return fail(err);
		}
	};

export interface ToolOptions {
	/**
	 * Whether the caller may read PNR data. PNR responses contain passenger
	 * personal information, so the tool is registered but refuses to run for
	 * unauthenticated callers.
	 */
	allowPnr: boolean;
}

export function registerRailTools(server: McpServer, opts: ToolOptions): void {
	server.registerTool(
		"getTrainInfo",
		{
			title: "Train schedule and route",
			description:
				"Full schedule for an Indian Railways train: name, type, days of run, " +
				"reserved classes, and every stop with arrival, departure, halt and distance. " +
				"Source: National Train Enquiry System (NTES).",
			inputSchema: { trainNumber }
		},
		guard(async ({ trainNumber: n }) => rail.getTrainInfo(n))
	);

	server.registerTool(
		"trackTrain",
		{
			title: "Live train running status",
			description:
				"Where a train is right now: station-by-station scheduled vs actual times, " +
				"delay, platform, and live coach position. Defaults to the journey currently " +
				"in progress. Source: NTES.",
			inputSchema: {
				trainNumber,
				date: journeyDate
					.optional()
					.describe(
						"Optional journey start date (DD-MM-YYYY). Omit to use the run currently in progress."
					)
			}
		},
		guard(async ({ trainNumber: n, date }) => rail.trackTrain(n, date))
	);

	server.registerTool(
		"searchTrainBetweenStations",
		{
			title: "Trains between two stations",
			description:
				"All direct trains between two stations, with departure, arrival, duration, " +
				"days of run and service type. Source: NTES.",
			inputSchema: {
				fromStation: stationCode.describe("Origin station code or name, e.g. NDLS."),
				toStation: stationCode.describe("Destination station code or name, e.g. MMCT.")
			}
		},
		guard(async ({ fromStation, toStation }) =>
			rail.searchTrainsBetweenStations(fromStation, toStation)
		)
	);

	server.registerTool(
		"getLiveStation",
		{
			title: "Live station board",
			description:
				"Trains arriving at or departing from a station in the next couple of hours, " +
				"with expected times, delay and platform. Source: NTES.",
			inputSchema: { stationCode }
		},
		guard(async ({ stationCode: code }) => rail.getLiveStation(code))
	);

	server.registerTool(
		"getSeatAvailability",
		{
			title: "Seat and berth availability",
			description:
				"Coach-by-coach vacancy for a train from IRCTC's reservation chart, plus " +
				"individual vacant berths when a travel class is given. Chart data exists " +
				"only after chart preparation (about 4 hours before departure) — check " +
				"chartPrepared before treating vacancies as final. Source: IRCTC.",
			inputSchema: {
				trainNumber,
				boardingStation: stationCode.describe(
					"Station you would board at, e.g. MMCT."
				),
				date: journeyDate.optional(),
				travelClass: z
					.string()
					.trim()
					.optional()
					.describe(
						"Optional class for berth-level detail: 1A, 2A, 3A, 3E, CC, EC, SL, 2S or FC."
					)
			}
		},
		guard(async (args) =>
			rail.getSeatAvailability({
				trainNumber: args.trainNumber,
				boardingStation: args.boardingStation,
				date: args.date,
				travelClass: args.travelClass
			})
		)
	);

	server.registerTool(
		"checkPnrStatus",
		{
			title: "PNR status",
			description:
				"Booking status for a 10-digit PNR: passengers, coach, berth and current " +
				"booking state. Returns personal data, so look up one PNR at a time and do " +
				"not store the result. Source: IRCTC.",
			inputSchema: {
				pnr: z
					.string()
					.trim()
					.regex(/^\d{10}$/, "A PNR is exactly 10 digits.")
					.describe("Ten-digit PNR number from your ticket.")
			}
		},
		guard(async ({ pnr }) => {
			if (!opts.allowPnr) {
				throw new rail.InvalidInputError(
					"PNR lookup is not available on this endpoint. It returns passenger " +
						"personal data and requires an authenticated caller (x-api-key)."
				);
			}
			return rail.checkPnrStatus(pnr);
		})
	);
}
