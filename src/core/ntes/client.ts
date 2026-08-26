import { NtesError, UpstreamError } from "../errors.ts";
import { BROWSER_UA, CookieJar, fetchWithTimeout } from "../http.ts";

export const NTES_BASE = "https://enquiry.indianrail.gov.in/mntes";

/**
 * Session state lives at module scope on purpose.
 *
 * On a warm serverless invocation the module is reused, so the cookie jar
 * survives between requests. Measured: a cold live-status call (session init +
 * two POSTs + two CSRF fetches) is ~885ms; warm it is ~124ms. Keeping this
 * here is the single biggest performance decision in the library.
 */
const jar = new CookieJar();
let sessionReady: Promise<void> | null = null;

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"User-Agent": BROWSER_UA,
		"Accept-Language": "en-US,en;q=0.9",
		Referer: `${NTES_BASE}/`,
		...(jar.size ? { Cookie: jar.header() } : {}),
		...extra
	};
}

async function ntesGet(path: string, extra: Record<string, string> = {}) {
	const res = await fetchWithTimeout(`${NTES_BASE}/${path}`, {
		headers: baseHeaders(extra)
	});
	jar.absorb(res);
	return res;
}

/** Fetch the landing page once to obtain JSESSIONID / SERVERID / TS* cookies. */
async function initSession(): Promise<void> {
	const res = await ntesGet("");
	await res.text();
	if (!jar.size) {
		throw new UpstreamError("NTES did not issue a session cookie.");
	}
}

function ensureSession(): Promise<void> {
	sessionReady ??= initSession().catch((err) => {
		// Never cache a failed handshake, or every later call inherits it.
		sessionReady = null;
		throw err;
	});
	return sessionReady;
}

/** Drop the cached session so the next call performs a fresh handshake. */
export function resetSession(): void {
	jar.clear();
	sessionReady = null;
}

/**
 * NTES issues a one-shot CSRF token whose *field name* is randomised per
 * request, e.g. `<input name='1pyhfggeu2cwl1787727586' value='p9ylf...'>`.
 * Both halves have to be parsed out and posted back.
 *
 * This is not an access control — the token is handed to any caller with no
 * credentials. It only proves the POST originated from a page on their site.
 */
async function csrfField(): Promise<[string, string]> {
	const res = await ntesGet(`GetCSRFToken?t=${Date.now()}`, {
		"X-Requested-With": "XMLHttpRequest"
	});
	const html = await res.text();
	const match = html.match(/name='([^']+)'\s+value='([^']+)'/);
	if (!match?.[1] || !match[2]) {
		throw new UpstreamError(
			"Could not read a CSRF token from NTES; the page format may have changed."
		);
	}
	return [match[1], match[2]];
}

const ERR_CODE = /\bERR\d{3,}\b/;

/** Pull NTES's human-readable error banner out of a response, if present. */
function errorDetail(html: string): string | undefined {
	const banner = html.match(
		/Requested service in un-available at the moment|Invalid[^<]{0,60}!!!/i
	);
	return banner?.[0]?.trim();
}

async function postOnce(
	path: string,
	fields: Record<string, string>
): Promise<string> {
	const [name, value] = await csrfField();
	const res = await fetchWithTimeout(`${NTES_BASE}/${path}`, {
		method: "POST",
		headers: baseHeaders({
			"Content-Type": "application/x-www-form-urlencoded",
			Origin: "https://enquiry.indianrail.gov.in"
		}),
		body: new URLSearchParams({ ...fields, [name]: value })
	});
	jar.absorb(res);
	return res.text();
}

/**
 * POST an NTES form, retrying once on a stale session.
 *
 * Errors arrive as HTTP 200 with an `ERR<nnn>` code in the body, so success can
 * only be judged on content.
 */
export async function ntesPost(
	path: string,
	fields: Record<string, string>
): Promise<string> {
	await ensureSession();

	let html: string;
	try {
		html = await postOnce(path, fields);
	} catch (err) {
		// A dropped/expired session looks like a transport failure; retry once clean.
		resetSession();
		await ensureSession();
		html = await postOnce(path, fields);
	}

	const code = html.match(ERR_CODE);
	if (code) throw new NtesError(code[0], errorDetail(html));
	return html;
}

/**
 * Navigate the main menu before a query, mirroring how a browser reaches the
 * page. Cheap, and it keeps our traffic shaped like an ordinary visitor's.
 */
export async function ntesNavigate(subOpt: string): Promise<void> {
	try {
		await ntesPost(`q?opt=MainMenu&subOpt=${subOpt}&excpType=`, { lan: "en" });
	} catch {
		// Navigation is a courtesy, not a requirement — never fail a query over it.
	}
}

/** Fetch one of NTES's static JS assets (the station/train catalogues). */
export async function ntesAsset(path: string): Promise<string> {
	const res = await fetchWithTimeout(`${NTES_BASE}/${path}`, {
		headers: { "User-Agent": BROWSER_UA, Referer: `${NTES_BASE}/` }
	});
	if (!res.ok) {
		throw new UpstreamError(`NTES asset ${path} returned HTTP ${res.status}.`);
	}
	return res.text();
}
