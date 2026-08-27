/**
 * Reproduces Vercel's function build and RUNS the result.
 *
 * This exists because of a real production outage: api/mcp.ts imported
 * "../src/mcp/server.ts", and Vercel compiles api/ with its own tsc settings
 * that do not rewrite ".ts" specifiers. The emitted JavaScript then imported a
 * file that does not exist at runtime and the function 500'd with
 * FUNCTION_INVOCATION_FAILED.
 *
 * Running the handlers from TypeScript source does NOT catch this — the source
 * imports resolve fine. Only the compiled artifact fails. So compile like
 * Vercel, then import and invoke.
 */
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = ".vercel-sim";
let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${detail}`);
	if (!ok) failures++;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("\n=== building library (dist/) ===");
execFileSync("npm", ["run", "build"], { stdio: "pipe", shell: true });

console.log("=== compiling api/ the way Vercel does (no extension rewriting) ===");
try {
	execFileSync(
		"npx",
		["tsc", "api/mcp.ts", "api/health.ts",
		 "--rootDir", "api", "--outDir", OUT,
		 "--module", "nodenext", "--moduleResolution", "nodenext",
		 "--target", "es2022", "--skipLibCheck"],
		{ stdio: "pipe", shell: true }
	);
} catch (err) {
	console.log(String(err.stdout ?? err));
	check("api/ compiles without allowImportingTsExtensions", false,
		"a .ts specifier is still present");
	process.exit(1);
}
check("api/ compiles without allowImportingTsExtensions", true);

// No emitted file may reference a .ts path — that is the exact production bug.
for (const file of readdirSync(OUT).filter((f) => f.endsWith(".js"))) {
	const src = readFileSync(join(OUT, file), "utf8");
	const bad = [...src.matchAll(/from\s+["']([^"']+\.ts)["']/g)].map((m) => m[1]);
	check(`${file} emits no .ts import specifier`, bad.length === 0, bad.join(", "));
}

console.log("\n=== loading and invoking the compiled handlers ===");
const mcp = await import(pathToFileURL(join(process.cwd(), OUT, "mcp.js")).href);
const health = await import(pathToFileURL(join(process.cwd(), OUT, "health.js")).href);

check("compiled mcp.js loads", true, Object.keys(mcp).sort().join(", "));
check("exports named methods", ["GET", "POST", "DELETE"].every((m) => typeof mcp[m] === "function"));

const get = await mcp.GET(new Request("https://x/api/mcp"));
check("GET /api/mcp (the request that 500'd)", get.status === 200, `HTTP ${get.status}`);

const h = await health.GET();
check("GET /api/health", h.status === 200, (await h.text()).replace(/\s+/g, " ").slice(0, 70));

const post = await mcp.POST(
	new Request("https://x/api/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
	})
);
const tools = JSON.parse(await post.text())?.result?.tools ?? [];
check("POST tools/list on compiled handler", post.status === 200 && tools.length === 6,
	`${tools.length} tools`);

rmSync(OUT, { recursive: true, force: true });
console.log(`\n=== ${failures === 0 ? "ALL PASSED" : failures + " FAILED"} ===`);
process.exit(failures ? 1 : 0);
