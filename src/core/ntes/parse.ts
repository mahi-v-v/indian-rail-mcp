import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";
import type {
	CoachSlot,
	JourneyInstance,
	LiveStationBoard,
	LiveStationTrain,
	RouteStop,
	RunningStop,
	TrainBetweenStations,
	TrainInfo,
	TrainRunning
} from "../types.ts";

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Split a cell on <br> and return the non-empty text of each part, in order. */
function brParts($: CheerioAPI, el: Element): string[] {
	const html = $(el).html() ?? "";
	return html
		.split(/<br\s*\/?>/i)
		.map((part) => clean(cheerio.load("<x>" + part + "</x>")("x").text()))
		.filter(Boolean);
}

const num = (s: string | null | undefined): number | null => {
	if (!s) return null;
	const m = s.match(/-?\d+/);
	return m ? Number(m[0]) : null;
};

const TIME = /\b\d{1,2}:\d{2}\b/;

const orNull = (s: string | undefined): string | null => {
	const v = s ? clean(s) : "";
	return v.length ? v : null;
};

// ─── Train schedule ────────────────────────────────────────────────────────────

/**
 * The schedule page renders two `.table-bordered` tables: a header block
 * (name, endpoints, days, type, classes) and the route table.
 */
export function parseSchedule(html: string, trainNumber: string): TrainInfo {
	const $ = cheerio.load(html);
	const tables = $("table.table-bordered");
	const header = tables.eq(0);
	const headerText = clean(header.text());

	const title = clean(header.find("b").first().text());
	const trainName = clean(title.replace(/^\d{4,5}\s*/, ""));

	const endpoints = clean(header.find("tr").eq(1).find("td").eq(0).text());
	const ends = endpoints.includes("-")
		? endpoints.split(/\s*-\s*/).map(clean)
		: [];

	const pick = (label: RegExp): string | null => {
		const m = headerText.match(label);
		return m && m[1] ? clean(m[1]) : null;
	};

	const classText = pick(/Reserved Class of Travel\s*:?\s*([A-Z0-9]+(?:\s*,\s*[A-Z0-9]+)*)/);
	const classes = (classText ?? "")
		.split(",")
		.map(clean)
		.filter(Boolean);

	const route: RouteStop[] = [];
	tables
		.eq(1)
		.find("tr")
		.each((_, tr) => {
			const cells = $(tr).find("td").toArray();
			if (cells.length < 6) return;

			const position = num(clean($(cells[0] as Element).text()));
			if (position === null) return; // header row

			const station = brParts($, cells[1] as Element);
			const times = brParts($, cells[3] as Element);
			const arrivalRaw = times[0] ?? "";
			const departureRaw = times[1] ?? "";

			route.push({
				position,
				stationName: station[0] ?? "",
				stationCode: station[1] ?? "",
				day: num(clean($(cells[2] as Element).text())),
				arrival: TIME.test(arrivalRaw) ? arrivalRaw : null,
				departure: TIME.test(departureRaw) ? departureRaw : null,
				haltMinutes: num(clean($(cells[4] as Element).text())),
				distanceKm: num(clean($(cells[5] as Element).text()))
			});
		});

	return {
		trainNumber,
		trainName,
		fromStationName: ends[0] ?? null,
		toStationName: ends[1] ?? null,
		travelTime: pick(/Travel Time\s*:?\s*([\d:]+\s*Hrs?\.?)/i),
		runsOn: pick(/Days of Run\s*:?\s*([A-Za-z,]+)/),
		type: pick(/Type\s*:?\s*([A-Z][A-Z ]*?)(?:\s*Reserved|\s*Sr\.|$)/),
		classes,
		route
	};
}

// ─── Trains between stations ───────────────────────────────────────────────────

/**
 * Each result is one row whose single cell holds:
 *   <span><b>16329</b> MAJN AMRITBHARAT</span><br><span>Wed | Amrit Bharat</span>
 *   <div style="...flex...">
 *     <span>DEP<br>FromName<br>FROM</span>
 *     <div>--HH:MM Hrs.--</div>
 *     <span>ARR<br>ToName<br>TO</span>
 *   </div>
 */
export function parseTrainsBetween(html: string): TrainBetweenStations[] {
	const $ = cheerio.load(html);
	const out: TrainBetweenStations[] = [];

	$("#myTable tr").each((_, tr) => {
		const cell = $(tr).find("td").first();
		if (!cell.length) return;

		const numberEl = cell.find("b").first();
		const trainNumber = clean(numberEl.text());
		if (!/^\d{4,5}$/.test(trainNumber)) return;

		const headSpan = numberEl.parent();
		const trainName = clean(headSpan.text().replace(trainNumber, ""));

		// "Wed | Amrit Bharat" — days of run, then service type.
		const meta = clean(headSpan.nextAll("span").first().text());
		const metaParts = meta.includes("|") ? meta.split("|").map(clean) : [meta];

		// The from/to block: first and last <span> inside the flex row.
		const legs = cell.find("div[style*='flex']").first();
		const spans = legs.children("span").toArray();
		const firstSpan = spans[0];
		const lastSpan = spans[spans.length - 1];
		const from = firstSpan ? brParts($, firstSpan as Element) : [];
		const to = lastSpan ? brParts($, lastSpan as Element) : [];
		const durationText = clean(legs.children("div").first().text());
		const duration = durationText.replace(/^-+|-+$/g, "").trim();

		out.push({
			trainNumber,
			trainName,
			runsOn: orNull(metaParts[0]),
			type: orNull(metaParts[1]),
			departure: from[0] && TIME.test(from[0]) ? from[0] : null,
			fromStationName: orNull(from[1]),
			fromStationCode: orNull(from[2]),
			arrival: to[0] && TIME.test(to[0]) ? to[0] : null,
			toStationName: orNull(to[1]),
			toStationCode: orNull(to[2]),
			duration: duration.length ? duration : null
		});
	});

	return out;
}

// ─── Live station board ────────────────────────────────────────────────────────

/**
 * Columns: Sr | Train No./Name + route + classes | Arrival | Departure | Platform.
 *
 * Time cells hold three <br> parts in the order actual, delay, scheduled —
 * verified against "13:02 ~ 24 Mins. ~ 12:38", where 12:38 + 24min = 13:02.
 * A train starting or terminating here shows "Source"/"Destination" instead.
 */
export function parseLiveStation(
	html: string,
	stationCode: string
): LiveStationBoard {
	const $ = cheerio.load(html);
	const heading = clean($("#myTable th").first().text());

	const nameMatch = heading.match(/at\s+[A-Z]+-\s*([A-Z][A-Z .]+?)\s+in next/i);
	const stationName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : null;
	const hoursMatch = heading.match(/next\s+(\d+)\s*Hrs/i);
	const windowHours = num(hoursMatch ? hoursMatch[1] : null) ?? 2;

	const readTime = (parts: string[]) => {
		if (!parts.length) return { actual: null, delay: null, scheduled: null };
		// "Source" / "Destination" markers carry no times.
		if (!parts.some((p) => TIME.test(p))) {
			return { actual: null, delay: orNull(parts[0]), scheduled: null };
		}
		return {
			actual: orNull(parts[0]),
			delay: orNull(parts[1]),
			scheduled: orNull(parts[2])
		};
	};

	const trains: LiveStationTrain[] = [];
	$("#myTable tr").each((_, tr) => {
		const cells = $(tr).find("td").toArray();
		if (cells.length < 5) return;

		const info = brParts($, cells[1] as Element);
		const titleLine = info[0] ?? "";
		const titleParts = titleLine.split("|");
		const trainNumber = clean(titleParts[0] ?? "");
		if (!/^\d{4,5}$/.test(trainNumber)) return;

		const arr = readTime(brParts($, cells[2] as Element));
		const dep = readTime(brParts($, cells[3] as Element));
		const platformParts = brParts($, cells[4] as Element);

		trains.push({
			trainNumber,
			trainName: clean(titleParts.slice(1).join("|")),
			route: orNull(info[1]),
			classes: (info[2] ?? "").split(",").map(clean).filter(Boolean),
			scheduledArrival: arr.scheduled,
			actualArrival: arr.actual,
			scheduledDeparture: dep.scheduled,
			actualDeparture: dep.actual,
			delay: dep.delay ?? arr.delay,
			platform: orNull(platformParts[0])
		});
	});

	return { stationCode, stationName, windowHours, trains };
}

// ─── Live running status ───────────────────────────────────────────────────────

const PANE_ID = /^train\d{1,2}-[a-z]{3}-\d{4}/i;

const titleCaseMonth = (iso: string): string =>
	iso.replace(
		/^(\d{1,2})-([a-z]{3})-(\d{4})$/i,
		(_m, d: string, mo: string, y: string) =>
			`${d.padStart(2, "0")}-${mo.charAt(0).toUpperCase()}${mo.slice(1).toLowerCase()}-${y}`
	);

/** The selectable journey dates, read from the tab strip. */
export function parseRunningInstances(html: string): JourneyInstance[] {
	const $ = cheerio.load(html);
	const out: JourneyInstance[] = [];
	$("a[data-bs-toggle='tab']").each((_, a) => {
		const label = clean($(a).text());
		if (!/\d{1,2}-[A-Za-z]{3}/.test(label)) return;
		const href = $(a).attr("href") ?? "";
		const m = href.match(/train(\d{1,2}-[a-z]{3}-\d{4})/i);
		out.push({ label, date: m && m[1] ? titleCaseMonth(m[1]) : null });
	});
	return out;
}

/**
 * Coach composition renders as a group of exactly three sibling divs:
 *   <div>3A</div>  <div><b>B1</b></div>  <div>9</div>
 * i.e. class code, coach label (bold, one level deeper), position from engine.
 */
function parseCoaches(scope: Cheerio<Element>, $: CheerioAPI): CoachSlot[] {
	const out: CoachSlot[] = [];
	const seen = new Set<string>();

	scope.find("div").each((_, el) => {
		const kids = $(el).children("div").toArray();
		if (kids.length !== 3) return;

		const bold = $(kids[1] as Element).children("b").first();
		if (!bold.length) return;

		const coach = clean(bold.text());
		const classCode = clean($(kids[0] as Element).text());
		const position = num(clean($(kids[2] as Element).text()));
		if (!coach || coach.length > 5 || !classCode || position === null) return;

		const key = `${coach}@${position}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ position, coach, classCode });
	});

	return out.sort((a, b) => a.position - b.position);
}

/**
 * A halt renders as a `.w3-card-2` holding: scheduled time (<font>), actual
 * time (<b>), a coloured delay chip, station name + code, an orange platform
 * chip and the distance. Source and destination cards substitute SRC/DSTN
 * markers for one side, so every field is read defensively.
 */
function parseHaltCard($: CheerioAPI, el: Element): RunningStop | null {
	const card = $(el).clone();

	// Every halt card embeds its own coach-position modal. Its bold coach labels
	// and numeric positions would otherwise be read as station and timing data,
	// so it has to come out before anything else is extracted.
	card
		.find("h4")
		.filter((_, h) => /Coach Position\s*:/.test($(h).text()))
		.parent()
		.remove();

	const text = clean(card.text());
	if (/Non-Stopping/.test(text)) return null;
	if (!TIME.test(text)) return null;

	const chips = card
		.find("span.w3-round")
		.map((_, s) => clean($(s).text()))
		.get()
		.filter(Boolean);
	const pfChip = chips.find((c) => /^PF\b/i.test(c));
	const platform = pfChip ? pfChip.replace(/^PF\s*/i, "").trim() : null;
	const delays = chips.filter((c) => !/^PF\b/i.test(c));

	const bolds = card
		.find("b")
		.map((_, b) => clean($(b).text()))
		.get()
		.filter(Boolean);

	// Bolds arrive as: schedArr, actArr, name, "CODE [PF n]", distance,
	// schedDep, actDep — with SRC/DSTN markers substituted at the endpoints.
	const times = bolds.filter((v) => TIME.test(v));
	const labels = bolds.filter(
		(v) => !TIME.test(v) && !/^(SRC|DSTN)$/i.test(v) && !/^\d+$/.test(v)
	);

	const stationName = labels[0] ?? "";
	// The code label is either "NDLS" or "CGY PF 3". Anchoring on a word boundary
	// stops a full station name ("THIRUVANANTHAPURAM CENTRAL") being truncated
	// into a plausible-looking but wrong code.
	const codeMatch = (labels[1] ?? "").match(/^[A-Z]{2,5}(?=\s|$)/);
	const stationCode = codeMatch ? codeMatch[0] : "";
	if (!stationCode) return null;

	const isSource = /\bSRC\b/.test(text);
	const isDest = /\bDSTN\b/.test(text);

	let scheduledArrival: string | null = null;
	let actualArrival: string | null = null;
	let scheduledDeparture: string | null = null;
	let actualDeparture: string | null = null;

	if (times.length >= 4) {
		scheduledArrival = orNull(times[0]);
		actualArrival = orNull(times[1]);
		scheduledDeparture = orNull(times[2]);
		actualDeparture = orNull(times[3]);
	} else if (times.length >= 2) {
		if (isSource) {
			scheduledDeparture = orNull(times[0]);
			actualDeparture = orNull(times[1]);
		} else {
			scheduledArrival = orNull(times[0]);
			actualArrival = orNull(times[1]);
		}
	} else if (times.length === 1) {
		if (isSource) scheduledDeparture = orNull(times[0]);
		else scheduledArrival = orNull(times[0]);
	}

	return {
		stationName,
		stationCode,
		scheduledArrival,
		actualArrival,
		scheduledDeparture,
		actualDeparture,
		// Arrival and departure each carry a delay chip; report the one that
		// reflects the train's latest known state at this stop.
		delay: (isDest ? delays[0] : delays[delays.length - 1]) ?? null,
		platform
	};
}

export function parseRunningStatus(
	html: string,
	trainNumber: string,
	preferredDate?: string
): TrainRunning {
	const $ = cheerio.load(html);
	const availableInstances = parseRunningInstances(html);

	const panes = $("div").filter((_, e) => PANE_ID.test($(e).attr("id") ?? ""));
	let pane = panes.first();

	if (preferredDate) {
		const wanted = preferredDate.toLowerCase();
		panes.each((_, e) => {
			if (($(e).attr("id") ?? "").toLowerCase().includes(wanted)) {
				pane = $(e);
				return false;
			}
			return undefined;
		});
	} else {
		// NTES lists several journey dates at once, newest first — and the newest
		// is usually a service that has not left yet. Someone asking "where is my
		// train" wants the run that is actually moving, so prefer a journey that
		// has departed but not yet terminated.
		panes.each((_, e) => {
			const summary = clean($(e).find("h6").first().text());
			if (!summary) return undefined;
			if (/Yet to start/i.test(summary)) return undefined;
			if (/Reached Destination|Terminated/i.test(summary)) return undefined;
			if (/Departed from|Arrived at|Running/i.test(summary)) {
				pane = $(e);
				return false;
			}
			return undefined;
		});
	}

	const paneId = pane.attr("id") ?? "";
	const dateMatch = paneId.match(/train(\d{1,2}-[a-z]{3}-\d{4})/i);
	const journeyDate = dateMatch && dateMatch[1] ? titleCaseMonth(dateMatch[1]) : null;

	const summary =
		clean(pane.find("h6").first().text()) ||
		clean(pane.find("h5").first().text()) ||
		null;

	// Halt cards nest, so the same stop can be reached more than once.
	const stops: RunningStop[] = [];
	const seenStops = new Set<string>();
	pane.find(".w3-card-2").each((_, el) => {
		const stop = parseHaltCard($, el as Element);
		if (!stop) return;
		const key = `${stop.stationCode}@${stop.scheduledArrival ?? stop.scheduledDeparture ?? ""}`;
		if (seenStops.has(key)) return;
		seenStops.add(key);
		stops.push(stop);
	});

	return {
		trainNumber,
		trainName: clean($("h3").first().text().replace(/^\d{4,5}\s*/, "")) || null,
		journeyDate,
		summary,
		availableInstances,
		stops,
		coachPosition: parseCoaches(pane, $)
	};
}
