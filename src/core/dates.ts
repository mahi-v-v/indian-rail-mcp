import { InvalidInputError } from "./errors.ts";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
] as const;

export interface ParsedDate {
	year: number;
	month: number; // 1-12
	day: number;
}

/**
 * Accept the formats a user or agent is likely to supply and normalise once:
 * DD-MM-YYYY (the Indian Railways convention), DD-MMM-YYYY (what NTES renders)
 * and YYYY-MM-DD (ISO, what IRCTC's chart API wants).
 */
export function parseDate(input: string): ParsedDate {
	const raw = input.trim();

	const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (iso) {
		return { year: +iso[1]!, month: +iso[2]!, day: +iso[3]! };
	}

	const numeric = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
	if (numeric) {
		return { day: +numeric[1]!, month: +numeric[2]!, year: +numeric[3]! };
	}

	const named = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})$/);
	if (named) {
		const idx = MONTHS.findIndex(
			(m) => m.toLowerCase() === named[2]!.slice(0, 3).toLowerCase()
		);
		if (idx >= 0) return { day: +named[1]!, month: idx + 1, year: +named[3]! };
	}

	throw new InvalidInputError(
		`Could not read the date "${input}". Use DD-MM-YYYY, for example 27-12-2026.`
	);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** NTES form format, e.g. "26-Aug-2026". */
export function toNtesDate(d: ParsedDate): string {
	const month = MONTHS[d.month - 1];
	if (!month) {
		throw new InvalidInputError(`"${d.month}" is not a valid month.`);
	}
	return `${pad(d.day)}-${month}-${d.year}`;
}

/** IRCTC chart API format, e.g. "2026-08-26". */
export function toIsoDate(d: ParsedDate): string {
	return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Today, in the caller's local timezone. */
export function today(): ParsedDate {
	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
		day: now.getDate()
	};
}
