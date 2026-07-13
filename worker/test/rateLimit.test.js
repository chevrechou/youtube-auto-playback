import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { checkRateLimit, RATE_LIMITS } from '../src/rateLimit.js';

describe('checkRateLimit', () => {
  beforeEach(async () => {
    await env.WATCH_TOGETHER_KV.delete('ratelimit:create:1.2.3.4');
    await env.WATCH_TOGETHER_KV.delete('ratelimit:join:1.2.3.4');
  });

  it('allows requests under the limit', async () => {
    const result = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.2.3.4');
    expect(result.allowed).toBe(true);
  });

  it('allows exactly up to the configured limit, then blocks with retryAfterSeconds', async () => {
    for (let i = 0; i < RATE_LIMITS.create; i++) {
      const result = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.2.3.4');
      expect(result.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it('tracks create and join limits independently per IP', async () => {
    for (let i = 0; i < RATE_LIMITS.create; i++) {
      await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.2.3.4');
    }
    const createBlocked = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.2.3.4');
    const joinStillAllowed = await checkRateLimit(env.WATCH_TOGETHER_KV, 'join', '1.2.3.4');
    expect(createBlocked.allowed).toBe(false);
    expect(joinStillAllowed.allowed).toBe(true);
  });

  it('tracks limits independently per IP', async () => {
    for (let i = 0; i < RATE_LIMITS.create; i++) {
      await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '1.1.1.1');
    }
    const otherIpAllowed = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', '2.2.2.2');
    expect(otherIpAllowed.allowed).toBe(true);
  });

  it('fails OPEN (allows the request) when the KV binding itself errors', async () => {
    const brokenKv = {
      get: async () => {
        throw new Error('KV unavailable');
      },
      put: async () => {
        throw new Error('KV unavailable');
      },
    };
    const result = await checkRateLimit(brokenKv, 'create', '9.9.9.9');
    expect(result.allowed).toBe(true);
  });
});
