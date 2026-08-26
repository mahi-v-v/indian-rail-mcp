/**
 * Drives the Vercel handler directly with MCP protocol requests — no network,
 * no deploy. Verifies the handshake, tool listing, a real tool call, the PNR
 * auth gate and the rate limiter.
 */
import handler from "../api/mcp.ts";

const ACCEPT = "application/json, text/event-stream";

async function rpc(
	method: string,
	params: unknown,
	headers: Record<string, string> = {},
	id: number | null = 1
): Promise<any> {
	const res = await handler(
		new Request("https://local.test/api/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: ACCEPT, ...headers },
			body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
		})
	);
	const text = await res.text();
	if (!text) return { _status: res.status, _empty: true };
	try {
		return { _status: res.status, ...JSON.parse(text) };
	} catch {
		// SSE framing: pull the data: line out.
		const line = text.split("\n").find((l) => l.startsWith("data:"));
		return { _status: res.status, ...(line ? JSON.parse(line.slice(5)) : { raw: text }) };
	}
}

const INIT = {
	protocolVersion: "2025-06-18",
	capabilities: {},
	clientInfo: { name: "local-test", version: "0" }
};

let failures = 0;
const check = (name: string, condition: boolean, detail = "") => {
	if (condition) console.log(`  PASS  ${name.padEnd(44)} ${detail}`);
	else {
		failures++;
		console.log(`  FAIL  ${name.padEnd(44)} ${detail}`);
	}
};

console.log("\n=== MCP protocol ===");
const init = await rpc("initialize", INIT);
check(
	"initialize",
	init.result?.serverInfo?.name === "indian-rail",
	`${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version} (HTTP ${init._status})`
);

const list = await rpc("tools/list", {});
const names: string[] = (list.result?.tools ?? []).map((t: any) => t.name).sort();
check("tools/list returns 6 tools", names.length === 6, names.join(", "));

const schemaOk = (list.result?.tools ?? []).every(
	(t: any) => t.inputSchema?.type === "object" && t.description?.length > 20
);
check("every tool has schema + description", schemaOk);

console.log("\n=== tool calls ===");
const info = await rpc("tools/call", {
	name: "getTrainInfo",
	arguments: { trainNumber: "12951" }
});
const infoText = info.result?.content?.[0]?.text ?? "";
const infoData = infoText.startsWith("{") ? JSON.parse(infoText) : {};
check(
	"getTrainInfo(12951)",
	infoData.trainName === "NDLS TEJAS RAJ" && infoData.route?.length > 0,
	`${infoData.trainName} | ${infoData.route?.length} stops`
);

const tbs = await rpc("tools/call", {
	name: "searchTrainBetweenStations",
	arguments: { fromStation: "CAN", toStation: "PAY" }
});
const tbsData = JSON.parse(tbs.result?.content?.[0]?.text ?? "[]");
check("searchTrainBetweenStations(CAN,PAY)", tbsData.length > 10, `${tbsData.length} trains`);

console.log("\n=== validation and auth ===");
const bad = await rpc("tools/call", {
	name: "searchTrainBetweenStations",
	arguments: { fromStation: "ZZZZ", toStation: "PAY" }
});
const badText = bad.result?.content?.[0]?.text ?? "";
check(
	"unknown station -> INVALID_INPUT, not a fake outage",
	bad.result?.isError === true && badText.includes("INVALID_INPUT"),
	JSON.parse(badText || "{}").message?.slice(0, 60)
);

const pnrNoKey = await rpc("tools/call", {
	name: "checkPnrStatus",
	arguments: { pnr: "1234567890" }
});
const pnrText = pnrNoKey.result?.content?.[0]?.text ?? "";
check(
	"PNR refused without x-api-key",
	pnrNoKey.result?.isError === true && pnrText.includes("requires an authenticated caller"),
	"gated"
);

process.env["RAIL_API_KEY"] = "test-key-123";
const pnrWithKey = await rpc(
	"tools/call",
	{ name: "checkPnrStatus", arguments: { pnr: "1234567890" } },
	{ "x-api-key": "test-key-123" }
);
const pnrKeyText = pnrWithKey.result?.content?.[0]?.text ?? "";
check(
	"PNR reaches IRCTC with a valid key",
	pnrKeyText.includes("IRCTC_ERROR") || pnrKeyText.includes("Pnr"),
	JSON.parse(pnrKeyText || "{}").message?.slice(0, 55)
);

console.log("\n=== rate limiting ===");
let got429 = false;
for (let i = 0; i < 40; i++) {
	const res = await handler(
		new Request("https://local.test/api/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: ACCEPT, "x-forwarded-for": "203.0.113.9" },
			body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/list", params: {} })
		})
	);
	if (res.status === 429) { got429 = true; break; }
}
check("rate limiter returns 429", got429, "throttles before hammering NTES");

console.log(`\n=== ${failures === 0 ? "ALL PASSED" : failures + " FAILED"} ===`);
process.exit(failures ? 1 : 0);
