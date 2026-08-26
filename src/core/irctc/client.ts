import { IrctcError } from "../errors.ts";
import { BROWSER_UA, fetchWithTimeout } from "../http.ts";

const CHARTS_BASE = "https://www.irctc.co.in/online-charts/api";
const PNR_BASE = "https://www.irctc.co.in/eticketing/protected/mapps1";

/**
 * IRCTC's chart service takes plain JSON with no cookie, token or captcha.
 * Referer/Origin are sent to match what the browser app does.
 */
function chartHeaders(): Record<string, string> {
	return {
		"User-Agent": BROWSER_UA,
		"Content-Type": "application/json",
		Accept: "application/json",
		Referer: "https://www.irctc.co.in/online-charts/",
		Origin: "https://www.irctc.co.in"
	};
}

/**
 * IRCTC signals failure with an `errorMessage` field in an otherwise HTTP 200
 * body, so success can only be judged on content.
 */
function unwrap<T extends Record<string, unknown>>(data: T): T {
	const message = data["errorMessage"];
	if (typeof message === "string" && message.trim()) {
		throw new IrctcError(message.trim());
	}
	const error = data["error"];
	if (typeof error === "string" && error.trim()) {
		throw new IrctcError(error.trim());
	}
	return data;
}

async function postChart<T extends Record<string, unknown>>(
	path: string,
	body: Record<string, unknown>
): Promise<T> {
	const res = await fetchWithTimeout(`${CHARTS_BASE}/${path}`, {
		method: "POST",
		headers: chartHeaders(),
		body: JSON.stringify(body)
	});

	const text = await res.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new IrctcError(
			`IRCTC ${path} returned a non-JSON response (HTTP ${res.status}).`
		);
	}

	if (!res.ok) {
		const message =
			(data as Record<string, unknown>)?.["error"] ??
			(data as Record<string, unknown>)?.["message"] ??
			`HTTP ${res.status}`;
		throw new IrctcError(`IRCTC ${path} failed: ${String(message)}`);
	}

	return unwrap(data as T);
}

export interface TrainCompositionResponse {
	cdd: Array<{
		coachName: string;
		classCode: string;
		positionFromEngine: number;
		vacantBerths: number;
	}>;
	trainNo: string;
	trainName: string | null;
	from: string | null;
	to: string | null;
	trainStartDate: string | null;
	remote: string | null;
	nextRemote: string | null;
	chartOneDate: string | null;
	chartTwoDate: string | null;
	chartStatusResponseDto?: {
		chartOneFlag?: number;
		chartTwoFlag?: number;
		messageType?: string;
	};
	[key: string]: unknown;
}

export interface VacantBerthResponse {
	vbd: Array<{
		coachName: string;
		berthNumber: number;
		berthCode: string;
		cabinCoupeNo: string | null;
		from: string;
		to: string;
		splitNo?: number;
	}>;
	[key: string]: unknown;
}

/** Coach list, chart status and per-coach vacancy counts. Always the first hop. */
export function getTrainComposition(
	trainNo: string,
	journeyDateIso: string,
	boardingStation: string
): Promise<TrainCompositionResponse> {
	return postChart<TrainCompositionResponse>("trainComposition", {
		trainNo,
		jDate: journeyDateIso,
		boardingStation
	});
}

/**
 * Individually vacant berths for one travel class.
 *
 * `chartType` must be sent as a NUMBER — passing "1" as a string makes the
 * Spring backend reject the body with HTTP 400 "Failed to read HTTP message".
 * The remoteStation / trainSourceStation / jDate values come from the
 * trainComposition response, not from user input.
 */
export function getVacantBerths(args: {
	trainNo: string;
	boardingStation: string;
	remoteStation: string;
	trainSourceStation: string;
	journeyDateIso: string;
	travelClass: string;
	chartType?: 1 | 2;
}): Promise<VacantBerthResponse> {
	return postChart<VacantBerthResponse>("vacantBerth", {
		trainNo: args.trainNo,
		boardingStation: args.boardingStation,
		remoteStation: args.remoteStation,
		trainSourceStation: args.trainSourceStation,
		jDate: args.journeyDateIso,
		cls: args.travelClass,
		chartType: args.chartType ?? 1
	});
}

/**
 * PNR status.
 *
 * The path says `protected`, but the endpoint requires no login — only the
 * `greq` timestamp header the web app sends. Responses contain passenger
 * personal data (names, ages, seats), so callers must never log, persist or
 * batch these. See the PNR notes in the README.
 */
export async function getPnrStatus(
	pnr: string
): Promise<Record<string, unknown>> {
	const res = await fetchWithTimeout(
		`${PNR_BASE}/pnrenq/${encodeURIComponent(pnr)}?pnrEnqType=E`,
		{
			headers: {
				"User-Agent": BROWSER_UA,
				Accept: "application/json",
				Referer: "https://www.irctc.co.in/nget/train-search",
				Origin: "https://www.irctc.co.in",
				greq: String(Date.now())
			}
		}
	);

	const text = await res.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new IrctcError(
			`IRCTC PNR enquiry returned a non-JSON response (HTTP ${res.status}). ` +
				`The endpoint may be temporarily unavailable.`
		);
	}

	return unwrap(data as Record<string, unknown>);
}
