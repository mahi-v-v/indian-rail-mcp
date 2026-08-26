/**
 * Local dev server — runs the same handler Vercel does, over node:http.
 *
 *   RAIL_API_KEY=dev-key node --experimental-strip-types dev-server.ts
 *
 * Useful for pointing an MCP client (or another app) at the server without
 * deploying.
 */
import { createServer } from "node:http";
import handler from "./api/mcp.ts";

const PORT = Number(process.env["PORT"] ?? 8787);

const server = createServer((req, res) => {
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
	console.log(`indian-rail MCP listening on http://localhost:${PORT}/api/mcp`);
	console.log(
		process.env["RAIL_API_KEY"]
			? "PNR enabled for callers sending x-api-key"
			: "PNR disabled (set RAIL_API_KEY to enable)"
	);
});
