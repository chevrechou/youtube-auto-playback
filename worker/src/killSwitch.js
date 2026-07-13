// Kill-switch: a KV-backed flag that can disable the whole Watch Together
// backend. Unlike rate limiting (rateLimit.js), this fails SAFE, not open —
// if we can't read the flag, we assume the worst and report `disabled: true`.
// That's a deliberately opposite failure posture from rate limiting: rate
// limiting favors availability, the kill-switch favors "if we can't tell
// whether it's safe, assume it isn't."

const KILL_SWITCH_KEY = 'killswitch:disabled';
const SIGNING_FAILURE_COUNT_KEY = 'killswitch:signing_failures';
const SIGNING_FAILURE_THRESHOLD = 3;

/**
 * @param {KVNamespace} kv
 * @returns {Promise<boolean>} true if the service is disabled (or if the
 *   flag couldn't be read at all — fail-safe).
 */
export async function isServiceDisabled(kv) {
  try {
    const value = await kv.get(KILL_SWITCH_KEY);
    return value === 'true';
  } catch (err) {
    console.log(
      JSON.stringify({
        event: 'killswitch_fail_safe',
        error: String(err && err.message ? err.message : err),
      })
    );
    return true;
  }
}

export async function setServiceDisabled(kv, disabled) {
  await kv.put(KILL_SWITCH_KEY, disabled ? 'true' : 'false');
}

/**
 * Consecutive-failure tracking for custom-token/JWT signing. We use a
 * KV-based counter (rather than an in-memory-per-invocation counter) because
 * Workers invocations are stateless and short-lived — an in-memory counter
 * would only ever see failures within a single request, never "N failures in
 * a row" across requests, which is the thing we actually want to detect
 * (e.g. a bad or revoked service account key). The KV counter persists
 * across invocations so "3 in a row" is meaningful.
 *
 * Best-effort: if KV itself is unavailable here, we don't let that mask the
 * original signing failure or throw a second error — we just skip tripping
 * the breaker for this call and log it.
 */
export async function recordSigningFailure(kv) {
  try {
    const raw = await kv.get(SIGNING_FAILURE_COUNT_KEY);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    await kv.put(SIGNING_FAILURE_COUNT_KEY, String(count), { expirationTtl: 60 * 60 * 24 });
    if (count >= SIGNING_FAILURE_THRESHOLD) {
      await setServiceDisabled(kv, true);
      console.log(
        JSON.stringify({ event: 'killswitch_auto_tripped', reason: 'signing_failures', count })
      );
    }
    return count;
  } catch (err) {
    console.log(
      JSON.stringify({
        event: 'signing_failure_counter_unavailable',
        error: String(err && err.message ? err.message : err),
      })
    );
    return null;
  }
}

export async function recordSigningSuccess(kv) {
  try {
    await kv.delete(SIGNING_FAILURE_COUNT_KEY);
  } catch (err) {
    // Non-fatal — worst case the counter lingers and takes one extra success
    // to clear, or a future read fails-open on parseInt(null) -> 0 anyway
    // since a missing key reads as null, not an error.
    console.log(
      JSON.stringify({
        event: 'signing_success_counter_reset_failed',
        error: String(err && err.message ? err.message : err),
      })
    );
  }
}
