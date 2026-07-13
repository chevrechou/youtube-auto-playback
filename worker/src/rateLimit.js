// IP-based rate limiting backed by Cloudflare KV.
//
// Fails OPEN: if the KV read/write itself errors (KV unavailable), the
// request is allowed through, and the fail-open event is logged (a
// console.log line — no external logging service wired up). This is a
// deliberately different posture than the kill-switch (see killSwitch.js),
// which fails SAFE — rate limiting favors availability over strictness.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const RATE_LIMITS = {
  create: 5,
  join: 20,
};

function keyFor(route, ip) {
  return `ratelimit:${route}:${ip}`;
}

/**
 * @param {KVNamespace} kv
 * @param {'create'|'join'} route
 * @param {string} ip
 * @returns {Promise<{allowed: true} | {allowed: false, retryAfterSeconds: number}>}
 */
export async function checkRateLimit(kv, route, ip) {
  const limit = RATE_LIMITS[route];
  const key = keyFor(route, ip);
  const now = Date.now();

  try {
    const raw = await kv.get(key);
    let record = raw ? JSON.parse(raw) : null;

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + WINDOW_MS };
      await kv.put(key, JSON.stringify(record), { expirationTtl: Math.ceil(WINDOW_MS / 1000) + 60 });
      return { allowed: true };
    }

    if (record.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000) };
    }

    record.count += 1;
    const ttl = Math.max(60, Math.ceil((record.resetAt - now) / 1000) + 60);
    await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
    return { allowed: true };
  } catch (err) {
    console.log(
      JSON.stringify({
        event: 'ratelimit_fail_open',
        route,
        ip,
        error: String(err && err.message ? err.message : err),
      })
    );
    return { allowed: true };
  }
}
