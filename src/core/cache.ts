/**
 * A tiny TTL memo.
 *
 * The plan called for HTTP `Cache-Control` per tool, but MCP traffic is POST
 * JSON-RPC, which shared caches will not store — so caching has to happen in
 * process instead. On a warm serverless instance this is what actually keeps
 * repeat questions ("when does 12951 run?") from becoming repeat load on NTES.
 *
 * Only genuinely stable answers are cached. Live running status, station
 * boards, seat availability and PNR are never cached.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

const MAX_ENTRIES = 500;

export async function memo<T>(
	key: string,
	ttlMs: number,
	fn: () => Promise<T>
): Promise<T> {
	const now = Date.now();
	const hit = store.get(key);
	if (hit && now < hit.expiresAt) return hit.value as T;

	const value = await fn();

	if (store.size >= MAX_ENTRIES) {
		for (const [k, v] of store) if (now >= v.expiresAt) store.delete(k);
		// Still full of live entries: drop the oldest insertion.
		if (store.size >= MAX_ENTRIES) {
			const oldest = store.keys().next();
			if (!oldest.done) store.delete(oldest.value);
		}
	}

	store.set(key, { value, expiresAt: now + ttlMs });
	return value;
}

export const TTL = {
	/** Timetables change with the seasonal rail schedule, not during a day. */
	schedule: 6 * 60 * 60 * 1000,
	/** The set of trains between two stations is stable within a day. */
	trainsBetween: 60 * 60 * 1000
} as const;

export function clearResponseCache(): void {
	store.clear();
}
