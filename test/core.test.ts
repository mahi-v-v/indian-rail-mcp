/** Pure-logic tests: no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, toIsoDate, toNtesDate } from "../src/core/dates.ts";
import { InvalidInputError } from "../src/core/errors.ts";

test("parseDate accepts the formats users actually type", () => {
	const expected = { year: 2026, month: 12, day: 27 };
	assert.deepEqual(parseDate("27-12-2026"), expected);
	assert.deepEqual(parseDate("27/12/2026"), expected);
	assert.deepEqual(parseDate("2026-12-27"), expected);
	assert.deepEqual(parseDate("27-Dec-2026"), expected);
	assert.deepEqual(parseDate("7-1-2026"), { year: 2026, month: 1, day: 7 });
});

test("parseDate rejects nonsense with a usable message", () => {
	assert.throws(() => parseDate("tomorrow"), InvalidInputError);
	assert.throws(() => parseDate("12-2026"), /DD-MM-YYYY/);
});

test("date formatters match each upstream's expectations", () => {
	const d = parseDate("07-01-2026");
	assert.equal(toNtesDate(d), "07-Jan-2026", "NTES form format");
	assert.equal(toIsoDate(d), "2026-01-07", "IRCTC chart API format");
});
