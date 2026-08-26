/**
 * Live smoke test — hits the real upstreams. Run with:
 *   node --experimental-strip-types test/smoke.ts
 * Uses an invalid PNR so no real passenger data is ever touched.
 */
import * as rail from "../src/core/index.ts";

let pass = 0;
let fail = 0;

async function check(name: string, fn: () => Promise<string>) {
	const started = Date.now();
	try {
		const detail = await fn();
		pass++;
		console.log(`  PASS  ${name.padEnd(38)} ${String(Date.now() - started).padStart(5)}ms  ${detail}`);
	} catch (err) {
		fail++;
		const msg = err instanceof Error ? err.message : String(err);
		console.log(`  FAIL  ${name.padEnd(38)} ${String(Date.now() - started).padStart(5)}ms  ${msg.slice(0, 110)}`);
	}
}

console.log("\n=== catalogue ===");
await check("getStations", async () => {
	const s = await rail.getStations();
	if (s.length < 8000) throw new Error(`only ${s.length} stations`);
	return `${s.length} stations`;
});
await check("resolveStation('NEW DELHI')", async () => {
	const s = await rail.resolveStation("NEW DELHI");
	if (s.code !== "NDLS") throw new Error(`got ${s.code}`);
	return `-> ${s.code}`;
});
await check("resolveStation('ZZZZ') rejects", async () => {
	try {
		await rail.resolveStation("ZZZZ");
	} catch (e) {
		if (e instanceof rail.InvalidInputError) return "InvalidInputError (never hit NTES)";
		throw e;
	}
	throw new Error("should have thrown");
});

console.log("\n=== NTES ===");
await check("getTrainInfo(12951)", async () => {
	const t = await rail.getTrainInfo("12951");
	if (!t.route.length) throw new Error("no route");
	return `${t.trainName} | ${t.type} | ${t.route.length} stops | ${t.route[0]!.stationCode}->${t.route.at(-1)!.stationCode}`;
});
await check("searchTrainsBetweenStations(CAN,PAY)", async () => {
	const r = await rail.searchTrainsBetweenStations("CAN", "PAY");
	if (!r.length) throw new Error("no trains");
	return `${r.length} trains | first ${r[0]!.trainNumber} ${r[0]!.trainName} ${r[0]!.departure}->${r[0]!.arrival}`;
});
await check("getLiveStation(NDLS)", async () => {
	const b = await rail.getLiveStation("NDLS");
	if (!b.trains.length) throw new Error("empty board");
	return `${b.trains.length} trains next ${b.windowHours}h | first ${b.trains[0]!.trainNumber} PF${b.trains[0]!.platform}`;
});
await check("trackTrain(12626)", async () => {
	const r = await rail.trackTrain("12626");
	return `date=${r.journeyDate} stops=${r.stops.length} coaches=${r.coachPosition.length} | ${(r.summary ?? "").slice(0, 45)}`;
});

console.log("\n=== IRCTC ===");
await check("getSeatAvailability(12951 MMCT)", async () => {
	const a = await rail.getSeatAvailability({ trainNumber: "12951", boardingStation: "MMCT" });
	if (!a.coaches.length) throw new Error("no coaches");
	return `${a.coaches.length} coaches | chart=${a.chartPrepared} | vacant=${a.totalVacant} | ${a.trainName}`;
});
await check("checkPnrStatus(invalid) errors cleanly", async () => {
	try {
		await rail.checkPnrStatus("1234567890");
		return "returned data (unexpected but not a crash)";
	} catch (e) {
		if (e instanceof rail.IrctcError) return `IrctcError: ${e.message.slice(0, 60)}`;
		throw e;
	}
});
await check("checkPnrStatus('abc') rejects locally", async () => {
	try {
		await rail.checkPnrStatus("abc");
	} catch (e) {
		if (e instanceof rail.InvalidInputError) return "InvalidInputError (never hit IRCTC)";
		throw e;
	}
	throw new Error("should have thrown");
});

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
