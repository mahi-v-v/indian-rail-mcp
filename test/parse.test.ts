/**
 * Parser regression tests.
 *
 * These run against recorded fixtures, not the network, so a markup change at
 * CRIS shows up as a failing assertion rather than a tool that quietly returns
 * nothing. Re-record with: node test/capture-fixtures.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	parseLiveStation,
	parseRunningInstances,
	parseRunningStatus,
	parseSchedule,
	parseTrainsBetween
} from "../src/core/ntes/parse.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string): string => readFileSync(join(DIR, name), "utf8");

test("parseSchedule reads the header block and full route", () => {
	const info = parseSchedule(fixture("schedule.html"), "12951");

	assert.equal(info.trainNumber, "12951");
	assert.equal(info.trainName, "NDLS TEJAS RAJ");
	assert.equal(info.fromStationName, "MUMBAI CENTRAL");
	assert.equal(info.toStationName, "NEW DELHI");
	assert.equal(info.type, "RAJDHANI");
	assert.equal(info.runsOn, "Daily");
	assert.deepEqual(info.classes, ["1A", "2A", "3A"]);

	assert.ok(info.route.length >= 8, `expected >=8 stops, got ${info.route.length}`);

	const first = info.route[0]!;
	assert.equal(first.stationCode, "MMCT");
	assert.equal(first.departure, "17:00");
	assert.equal(first.arrival, null, "origin has no arrival time");
	assert.equal(first.distanceKm, 0);

	const borivali = info.route[1]!;
	assert.equal(borivali.stationCode, "BVI");
	assert.equal(borivali.arrival, "17:20");
	assert.equal(borivali.departure, "17:22");
	assert.equal(borivali.haltMinutes, 2);
	assert.equal(borivali.distanceKm, 30);

	assert.equal(info.route.at(-1)!.stationCode, "NDLS");
});

test("parseTrainsBetween reads every train with legs and metadata", () => {
	const trains = parseTrainsBetween(fixture("trains-between.html"));

	assert.ok(trains.length >= 30, `expected >=30 trains, got ${trains.length}`);

	const first = trains[0]!;
	assert.equal(first.trainNumber, "16329");
	assert.equal(first.trainName, "MAJN AMRITBHARAT");
	assert.equal(first.runsOn, "Wed");
	assert.equal(first.type, "Amrit Bharat");
	assert.equal(first.departure, "00:50");
	assert.equal(first.arrival, "01:19");
	assert.equal(first.fromStationCode, "CAN");
	assert.equal(first.toStationCode, "PAY");
	assert.match(first.duration ?? "", /00:29/);

	// No entry should be half-parsed.
	for (const t of trains) {
		assert.match(t.trainNumber, /^\d{4,5}$/);
		assert.ok(t.trainName.length > 0, `train ${t.trainNumber} has no name`);
	}
});

test("parseLiveStation reads the board, delays and platforms", () => {
	const board = parseLiveStation(fixture("live-station.html"), "NDLS");

	assert.equal(board.stationCode, "NDLS");
	assert.equal(board.stationName, "NEW DELHI");
	assert.equal(board.windowHours, 2);
	assert.ok(board.trains.length >= 15, `expected >=15 trains, got ${board.trains.length}`);

	const gomti = board.trains.find((t) => t.trainNumber === "12420");
	assert.ok(gomti, "expected 12420 GOMTI EXPRESS on the board");
	assert.equal(gomti.trainName, "GOMTI EXPRESS");
	assert.equal(gomti.scheduledDeparture, "12:55");
	assert.ok(gomti.classes.includes("1A"));

	// A delayed train: scheduled + delay must equal the actual time.
	const emu = board.trains.find((t) => t.trainNumber === "64052");
	assert.ok(emu, "expected 64052 on the board");
	assert.equal(emu.scheduledArrival, "12:38");
	assert.equal(emu.actualArrival, "13:02");
	assert.match(emu.delay ?? "", /\d+\s*Min/i);
});

test("parseRunningInstances lists selectable journey dates", () => {
	const instances = parseRunningInstances(fixture("running-instances.html"));

	assert.ok(instances.length >= 5, `expected >=5 instances, got ${instances.length}`);
	for (const i of instances) {
		assert.match(i.date ?? "", /^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
	}
});

test("parseRunningStatus reads halts, times, delay and coach position", () => {
	const run = parseRunningStatus(fixture("running-full.html"), "12626");

	assert.ok(run.stops.length >= 3, `expected >=3 stops, got ${run.stops.length}`);
	assert.match(run.summary ?? "", /Arrived at|Departed from|Yet to start/);

	for (const stop of run.stops) {
		assert.match(
			stop.stationCode,
			/^[A-Z]{2,5}$/,
			`bad station code "${stop.stationCode}" — a station NAME must never be truncated into a code`
		);
	}

	const cgy = run.stops.find((s) => s.stationCode === "CGY");
	assert.ok(cgy, "expected CHANGANASSERI in the parsed stops");
	assert.equal(cgy.stationName, "CHANGANASSERI");
	assert.equal(cgy.scheduledArrival, "18:13 25-Aug");
	assert.equal(cgy.actualArrival, "18:31 25-Aug");
	assert.equal(cgy.platform, "3");

	// Coach position must survive the coach-modal stripping done for stops.
	assert.ok(
		run.coachPosition.length >= 15,
		`expected >=15 coaches, got ${run.coachPosition.length}`
	);
	assert.equal(run.coachPosition[0]!.position, 0);
	assert.ok(run.coachPosition.some((c) => c.coach === "B1" && c.classCode === "3A"));
});

test("no stop is ever built from coach-modal content", () => {
	const run = parseRunningStatus(fixture("running-full.html"), "12626");
	// ENG/LPR are coach labels; they must never appear as station codes.
	for (const stop of run.stops) {
		assert.ok(
			!["ENG", "LPR", "PC", "VP"].includes(stop.stationCode),
			`coach label "${stop.stationCode}" leaked into the stop list`
		);
	}
});
