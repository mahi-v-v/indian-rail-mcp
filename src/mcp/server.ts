import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRailTools, type ToolOptions } from "./tools.ts";

export const SERVER_NAME = "indian-rail";
export const SERVER_VERSION = "0.1.0";

/**
 * Build an MCP server exposing the Indian Railways tools.
 *
 * `allowPnr` gates the one tool that returns passenger personal data; the
 * transport decides it, normally from an API key on the request.
 */
export function createRailMcpServer(opts: ToolOptions): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			capabilities: { tools: {} },
			instructions:
				"Indian Railways data from official sources (NTES and IRCTC). " +
				"Station arguments accept either a code (NDLS) or a full name (NEW DELHI). " +
				"Dates are DD-MM-YYYY. Seat availability comes from the reservation chart " +
				"and is only meaningful once chartPrepared is true."
		}
	);

	registerRailTools(server, opts);
	return server;
}
