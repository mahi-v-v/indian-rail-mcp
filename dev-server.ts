/**
 * Local dev server — runs the same handler Vercel does, over node:http.
 *
 *   RAIL_API_KEY=dev-key node --experimental-strip-types dev-server.ts
 *
 * Useful for pointing an MCP client (or another app) at the server without
 * deploying.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import handler from "./api/mcp.ts";

const STATIC_DIR = "public";
const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".json": "application/json",
	".ico": "image/x-icon",
	".png": "image/png"
};

const PORT = Number(process.env["PORT"] ?? 8787);

const server = createServer((req, res) => {
	const path = (req.url ?? "/").split("?")[0] ?? "/";

	// Anything outside /api is served from public/, matching how Vercel treats
	// `outputDirectory: "public"` alongside the api/ function.
	if (!path.startsWith("/api/")) {
		const rel = path === "/" ? "index.html" : normalize(path).replace(/^([/\.]+)/, "");
		readFile(join(STATIC_DIR, rel))
			.then((body) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", MIME[extname(rel)] ?? "application/octet-stream");
				res.end(body);
			})
			.catch(() => {
				res.statusCode = 404;
				res.end("Not found");
			});
		return;
	}

	const chunks: Buffer[] = [];
	req.on("data", (c: Buffer) => chunks.push(c));
	req.on("end", () => {
		const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url ?? "/"}`;
		const headers = new Headers();
		for (const [k, v] of Object.entries(req.headers)) {
			if (typeof v === "string") headers.set(k, v);
			else if (Array.isArray(v)) headers.set(k, v.join(", "));
		}

		const method = req.method ?? "GET";
		const request = new Request(url, {
			method,
			headers,
			body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks)
		});

		handler(request)
			.then(async (response) => {
				res.statusCode = response.status;
				response.headers.forEach((value, key) => res.setHeader(key, value));
				res.end(Buffer.from(await response.arrayBuffer()));
			})
			.catch((err: unknown) => {
				res.statusCode = 500;
				res.end(String(err instanceof Error ? err.message : err));
			});
	});
});

server.listen(PORT, () => {
	console.log(`indian-rail MCP  http://localhost:${PORT}/api/mcp`);
	console.log(`landing page     http://localhost:${PORT}/`);
	console.log(
		process.env["RAIL_API_KEY"]
			? "PNR enabled for callers sending x-api-key"
			: "PNR disabled (set RAIL_API_KEY to enable)"
	);
});
