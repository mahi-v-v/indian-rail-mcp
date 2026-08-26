import { UpstreamError } from "./errors.ts";

export const BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT_MS = 20_000;

/** fetch with a timeout, surfacing aborts as a typed error. */
export async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (err) {
		const reason =
			err instanceof Error && err.name === "TimeoutError"
				? `timed out after ${timeoutMs}ms`
				: err instanceof Error
					? err.message
					: String(err);
		throw new UpstreamError(`Request to ${new URL(url).host} failed: ${reason}`);
	}
}

/**
 * A cookie jar just large enough for NTES.
 *
 * NTES hands out JSESSIONID, SERVERID (load-balancer stickiness) and two F5
 * BIG-IP WAF cookies (TS*). All of them must be echoed back or the session is
 * treated as new, which costs an extra round trip per request.
 */
export class CookieJar {
	private jar = new Map<string, string>();

	absorb(res: Response): void {
		for (const cookie of res.headers.getSetCookie?.() ?? []) {
			const [pair] = cookie.split(";");
			if (!pair) continue;
			const eq = pair.indexOf("=");
			if (eq > 0) {
				this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
			}
		}
	}

	header(): string {
		return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
	}

	get size(): number {
		return this.jar.size;
	}

	clear(): void {
		this.jar.clear();
	}
}
