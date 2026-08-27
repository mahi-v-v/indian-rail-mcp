#!/usr/bin/env node
/**
 * stdio entry point.
 *
 * The MCP client launches this as a subprocess and talks over stdin/stdout —
 * there is no network server and no URL. That matters for more than
 * convenience: requests to NTES and IRCTC originate from the machine running
 * the client, not from a datacenter.
 *
 * IRCTC's edge returns "Access Denied" to our hosted deployment while serving
 * the same request normally from an ordinary connection, so the stdio build is
 * the only one where all six tools work. It is also the better privacy story:
 * PNR responses never leave the user's own machine.
 *
 *   npx indian-rail-mcp
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRailMcpServer } from "./server.ts";

async function main(): Promise<void> {
	// Running locally, so the caller is the machine's owner: PNR is available
	// without an API key. The key only exists to gate a *public* HTTP endpoint.
	const server = createRailMcpServer({ allowPnr: true });
	const transport = new StdioServerTransport();

	// stdout is the protocol channel — anything written there corrupts the
	// JSON-RPC stream. Diagnostics must go to stderr.
	console.error("indian-rail MCP server ready (stdio)");

	await server.connect(transport);

	const shutdown = async () => {
		await server.close().catch(() => {});
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
	console.error(
		"indian-rail MCP failed to start:",
		err instanceof Error ? err.message : String(err)
	);
	process.exit(1);
});
