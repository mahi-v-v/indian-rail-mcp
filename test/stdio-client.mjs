/**
 * Drives the stdio server the way a real MCP client does: spawn it as a
 * subprocess and exchange newline-delimited JSON-RPC over stdin/stdout.
 *
 * The point of this build is that requests originate from THIS machine, so the
 * IRCTC tools — which a datacenter deployment cannot reach — must pass here.
 */
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/mcp/stdio.js"], {
	stdio: ["pipe", "pipe", "pipe"]
});

let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
	buffer += chunk.toString();
	let nl;
	while ((nl = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, nl).trim();
		buffer = buffer.slice(nl + 1);
		if (!line) continue;
		let msg;
		try { msg = JSON.parse(line); } catch { continue; }
		const resolve = pending.get(msg.id);
		if (resolve) { pending.delete(msg.id); resolve(msg); }
	}
});
child.stderr.on("data", (d) => {
	const s = d.toString().trim();
	if (s && !/ExperimentalWarning|--trace-warnings/.test(s)) console.log("  [stderr]", s);
});

let id = 0;
const rpc = (method, params) =>
	new Promise((resolve, reject) => {
		const myId = ++id;
		pending.set(myId, resolve);
		child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
		setTimeout(() => { pending.delete(myId); reject(new Error("timeout")); }, 60000);
	});

let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(38)} ${detail}`);
	if (!ok) failures++;
};

const init = await rpc("initialize", {
	protocolVersion: "2025-06-18", capabilities: {},
	clientInfo: { name: "stdio-test", version: "1.0" }
});
check("initialize over stdio", init.result?.serverInfo?.name === "indian-rail",
	`${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version}`);

child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const list = await rpc("tools/list", {});
const names = (list.result?.tools ?? []).map((t) => t.name);
check("tools/list", names.length === 6, `${names.length} tools`);

const call = async (name, args) => {
	const t = Date.now();
	const res = await rpc("tools/call", { name, arguments: args });
	const text = res.result?.content?.[0]?.text ?? "";
	let data; try { data = JSON.parse(text); } catch { data = text; }
	return { ms: Date.now() - t, isError: res.result?.isError === true, data };
};

console.log("\n  --- NTES ---");
let r = await call("getTrainInfo", { trainNumber: "12951" });
check("getTrainInfo", !r.isError && r.data.route?.length > 0, `${r.ms}ms  ${r.data.trainName} | ${r.data.route?.length} stops`);

r = await call("searchTrainBetweenStations", { fromStation: "CAN", toStation: "PAY" });
check("searchTrainBetweenStations", !r.isError && r.data.length > 10, `${r.ms}ms  ${r.data.length} trains`);

r = await call("getLiveStation", { stationCode: "NDLS" });
check("getLiveStation", !r.isError && r.data.trains?.length > 0, `${r.ms}ms  ${r.data.trains?.length} trains`);

r = await call("trackTrain", { trainNumber: "12626" });
check("trackTrain", !r.isError && r.data.coachPosition?.length > 0, `${r.ms}ms  ${r.data.stops?.length} stops, ${r.data.coachPosition?.length} coaches`);

console.log("\n  --- IRCTC (the tools a datacenter cannot reach) ---");
r = await call("getSeatAvailability", { trainNumber: "12951", boardingStation: "MMCT", travelClass: "3A" });
check("getSeatAvailability", !r.isError && r.data.coaches?.length > 0,
	`${r.ms}ms  ${r.data.coaches?.length} coaches, ${r.data.vacantBerths?.length} berths`);

r = await call("checkPnrStatus", { pnr: "1234567890" });
const reachedIrctc = String(r.data?.message ?? "").includes("Pnr");
check("checkPnrStatus reaches IRCTC (no key needed)", reachedIrctc,
	`${r.ms}ms  ${String(r.data?.message ?? "").slice(0, 52)}`);

child.stdin.end();
child.kill();
console.log(`\n  === ${failures === 0 ? "ALL PASSED" : failures + " FAILED"} ===`);
process.exit(failures ? 1 : 0);
