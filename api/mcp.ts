import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRailMcpServer } from "../src/mcp/server.ts";

/**
 * Vercel Web Handler.
 *
 * Named method exports (GET/POST/DELETE) are what opt this file into the Web
 * standard Request/Response signature. A bare `export default function
 * handler(request)` is treated as the Node.js `(req, res)` handler instead, and
 * Vercel then passes an IncomingMessage — at which point `request.headers.get()`
 * and `new URL(request.url)` both throw and the function 500s.
 */

/**
 * Per-instance rate limiter.
 *
 * Serverless means this is per warm instance rather than global, so it is a
 * throttle rather than a guarantee. It exists to keep one caller from hammering
 * NTES/IRCTC through this endpoint — those are public services behind an F5
 * WAF, and getting this deployment's shared egress IPs throttled would affect
 * everyone on them.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env["RATE_LIMIT_PER_MINUTE"] ?? 30);
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): { limited: boolean; retryAfter: number } {
	const now = Date.now();
	const entry = hits.get(ip);

	if (!entry || now >= entry.resetAt) {
		hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		if (hits.size > 5000) {
			for (const [key, value] of hits) if (now >= value.resetAt) hits.delete(key);
		}
		return { limited: false, retryAfter: 0 };
	}

	entry.count += 1;
	return {
		limited: entry.count > MAX_PER_WINDOW,
		retryAfter: Math.ceil((entry.resetAt - now) / 1000)
	};
}

const clientIp = (request: Request): string =>
	request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
	request.headers.get("x-real-ip") ??
	"unknown";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * A plain `===` returns as soon as two bytes differ, so how long it takes is a
 * function of how many leading characters the guess got right. Lengths are
 * hashed first because timingSafeEqual throws on a length mismatch, which would
 * leak the key's length.
 */
function secretsMatch(a: string, b: string): boolean {
	const ha = createHash("sha256").update(a).digest();
	const hb = createHash("sha256").update(b).digest();
	return timingSafeEqual(ha, hb);
}

/**
 * PNR returns passenger personal data, so it is only enabled for a caller
 * presenting the configured key. Everything else is open.
 *
 * RAIL_API_KEY is a secret you generate yourself — it is not issued by IRCTC,
 * CRIS or anyone else. It exists because this endpoint is public: without it,
 * anyone who found the URL could look up passenger details through your
 * deployment, with your server making the requests.
 */
function pnrAuthorized(request: Request): boolean {
	const expected = process.env["RAIL_API_KEY"];
	if (!expected) return false; // fail closed when no key is configured
	const provided =
		request.headers.get("x-api-key") ??
		request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
		"";
	return provided.length > 0 && secretsMatch(provided, expected);
}

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
	new Response(JSON.stringify(body, null, 2), {
		status,
		headers: { "Content-Type": "application/json", ...headers }
	});

async function serveMcp(request: Request): Promise<Response> {
	const { limited, retryAfter } = rateLimited(clientIp(request));
	if (limited) {
		return json(
			429,
			{
				jsonrpc: "2.0",
				error: {
					code: -32029,
					message: `Rate limit exceeded. Retry in ${retryAfter}s.`
				},
				id: null
			},
			{ "Retry-After": String(retryAfter) }
		);
	}

	// Stateless: a fresh server and transport per request. Serverless instances
	// are not sticky, so a session store would break across invocations. The
	// expensive state (NTES cookie jar, station catalogue) lives at module scope
	// in the core library and is what actually survives between warm calls.
	const server = createRailMcpServer({ allowPnr: pnrAuthorized(request) });
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});

	try {
		await server.connect(transport);
		return await transport.handleRequest(request);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json(500, {
			jsonrpc: "2.0",
			error: { code: -32603, message: `Internal error: ${message}` },
			id: null
		});
	} finally {
		await server.close().catch(() => {});
	}
}

export async function POST(request: Request): Promise<Response> {
	return serveMcp(request);
}

/**
 * MCP's Streamable HTTP transport uses GET to open an SSE stream. A browser
 * visiting this URL sends no such Accept header, and would otherwise get a bare
 * "Not Acceptable" JSON-RPC error — so answer people with something useful and
 * leave real clients to the transport.
 */
export async function GET(request: Request): Promise<Response> {
	const accept = request.headers.get("accept") ?? "";
	if (accept.includes("text/event-stream")) return serveMcp(request);

	return json(200, {
		name: "indian-rail",
		description:
			"Indian Railways MCP server — train schedules, live running status, " +
			"seat availability and PNR status.",
		transport: "Streamable HTTP (POST JSON-RPC to this URL)",
		health: "/api/health",
		documentation: "https://github.com/mahi-v-v/indian-rail-mcp",
		hint: "This endpoint speaks MCP. Point an MCP client at it rather than a browser."
	});
}

export async function DELETE(request: Request): Promise<Response> {
	return serveMcp(request);
}
