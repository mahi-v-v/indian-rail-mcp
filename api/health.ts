/**
 * Health and diagnostics.
 *
 * A separate function rather than a path under /api/mcp: Vercel rewrites change
 * the path the function sees, so a `/api/mcp/health` rewrite would arrive
 * looking exactly like a plain `/api/mcp` request and fall through to the MCP
 * transport.
 */
export async function GET(): Promise<Response> {
	// NTES and IRCTC are both in India, so running from bom1 is worth several
	// hundred ms per upstream call — and our flows make two to four sequential
	// calls. Surfacing the region makes a silent fallback visible.
	const region = process.env["VERCEL_REGION"] ?? "local";

	return new Response(
		JSON.stringify(
			{
				status: "ok",
				server: "indian-rail",
				region,
				regionOptimal: region === "bom1" || region === "local",
				pnrEnabled: Boolean(process.env["RAIL_API_KEY"])
			},
			null,
			2
		),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store"
			}
		}
	);
}
