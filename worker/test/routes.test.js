import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { handleRequest } from '../src/index.js';
import { setServiceDisabled } from '../src/killSwitch.js';
import { RATE_LIMITS } from '../src/rateLimit.js';

const BASE = 'https://worker.example';

function req(path, { method = 'GET', body, ip = '203.0.113.1' } = {}) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Stubs global fetch for the duration of a test so every outbound call made
// by src/firebase.js and src/auth.js (Google OAuth exchange + RTDB REST
// calls) is intercepted — no real network access happens in these tests.
function stubFetch(handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), {
          status: 200,
        });
      }
      return handler(url, options);
    })
  );
}

async function resetKv() {
  await setServiceDisabled(env.WATCH_TOGETHER_KV, false);
  for (const route of ['create', 'join', 'refresh']) {
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4']) {
      await env.WATCH_TOGETHER_KV.delete(`ratelimit:${route}:${ip}`);
    }
  }
  await env.WATCH_TOGETHER_KV.delete('killswitch:signing_failures');
}

beforeEach(async () => {
  await resetKv();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OPTIONS / unknown routes', () => {
  it('answers CORS preflight', async () => {
    const res = await handleRequest(req('/watch-together/create', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
  });

  it('404s anything outside /watch-together/*', async () => {
    const res = await handleRequest(req('/something-else'), env);
    expect(res.status).toBe(404);
  });
});

describe('POST /watch-together/create', () => {
  it('happy path: writes the room doc and returns a roomCode + customToken', async () => {
    let putBody = null;
    stubFetch((url, options) => {
      if (options.method === 'GET') {
        return new Response('null', { status: 200 }); // no collision
      }
      if (options.method === 'PUT') {
        putBody = JSON.parse(options.body);
        return new Response('{}', { status: 200 });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const res = await handleRequest(req('/watch-together/create', { method: 'POST', body: { videoId: 'dQw4w9WgXcQ' } }), env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(typeof json.customToken).toBe('string');
    expect(putBody.state.videoId).toBe('dQw4w9WgXcQ');
  });

  it('400s an invalid videoId', async () => {
    const res = await handleRequest(
      req('/watch-together/create', { method: 'POST', body: { videoId: 'not-valid!' } }),
      env
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_video_id' });
  });

  it('503s when the kill-switch is active', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, true);
    const res = await handleRequest(
      req('/watch-together/create', { method: 'POST', body: { videoId: 'dQw4w9WgXcQ' } }),
      env
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'service_disabled' });
  });

  it('429s after exceeding the create rate limit for an IP', async () => {
    stubFetch((url, options) => {
      if (options.method === 'GET') return new Response('null', { status: 200 });
      if (options.method === 'PUT') return new Response('{}', { status: 200 });
      throw new Error(`unexpected call: ${url}`);
    });

    for (let i = 0; i < RATE_LIMITS.create; i++) {
      const ok = await handleRequest(
        req('/watch-together/create', { method: 'POST', body: { videoId: 'dQw4w9WgXcQ' }, ip: '203.0.113.2' }),
        env
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await handleRequest(
      req('/watch-together/create', { method: 'POST', body: { videoId: 'dQw4w9WgXcQ' }, ip: '203.0.113.2' }),
      env
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('502s (and does not mint a token) when the Firebase write fails', async () => {
    stubFetch((url, options) => {
      if (options.method === 'GET') return new Response('null', { status: 200 });
      if (options.method === 'PUT') return new Response('nope', { status: 500 });
      throw new Error(`unexpected call: ${url}`);
    });
    const res = await handleRequest(
      req('/watch-together/create', { method: 'POST', body: { videoId: 'dQw4w9WgXcQ' } }),
      env
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('backend_unavailable');
    expect(body.customToken).toBeUndefined();
  });
});

describe('POST /watch-together/join', () => {
  it('happy path: returns customToken + current room state', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 42.5, isPaused: false },
          participants: { peer1: Date.now() },
        }),
        { status: 200 }
      )
    );
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' } }),
      env
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.customToken).toBe('string');
    expect(json.videoId).toBe('dQw4w9WgXcQ');
    expect(json.currentTime).toBe(42.5);
    expect(json.isPaused).toBe(false);
  });

  it('400s an invalid room code', async () => {
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'bad' } }),
      env
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_room_code' });
  });

  it('404s when the room does not exist', async () => {
    stubFetch(() => new Response('null', { status: 200 }));
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' } }),
      env
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'room_not_found' });
  });

  it('409s when the room already has 2 active participants', async () => {
    const now = Date.now();
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 0, isPaused: true },
          participants: { peer1: now - 1000, peer2: now - 2000 },
        }),
        { status: 200 }
      )
    );
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' } }),
      env
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'room_full' });
  });

  it('allows joining when the room has a full participant count but some are stale (>60s)', async () => {
    const now = Date.now();
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 0, isPaused: true },
          participants: { peer1: now - 1000, staleGhost: now - 120000 },
        }),
        { status: 200 }
      )
    );
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' } }),
      env
    );
    expect(res.status).toBe(200);
  });

  it('429s after exceeding the join rate limit for an IP', async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ state: { videoId: null, currentTime: 0, isPaused: true }, participants: {} }), {
        status: 200,
      })
    );
    for (let i = 0; i < RATE_LIMITS.join; i++) {
      const ok = await handleRequest(
        req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' }, ip: '203.0.113.3' }),
        env
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' }, ip: '203.0.113.3' }),
      env
    );
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe('rate_limited');
  });

  it('503s when the kill-switch is active', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, true);
    const res = await handleRequest(
      req('/watch-together/join', { method: 'POST', body: { roomCode: 'AB12CD' } }),
      env
    );
    expect(res.status).toBe(503);
  });
});

describe('POST /watch-together/refresh', () => {
  it('happy path: re-mints a token when clientId is a current participant', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 0, isPaused: true },
          participants: { 'client-abc': Date.now() },
        }),
        { status: 200 }
      )
    );
    const res = await handleRequest(
      req('/watch-together/refresh', { method: 'POST', body: { roomCode: 'AB12CD', clientId: 'client-abc' } }),
      env
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.customToken).toBe('string');
  });

  it('403s when clientId is not present in the room participants map', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 0, isPaused: true },
          participants: { 'someone-else': Date.now() },
        }),
        { status: 200 }
      )
    );
    const res = await handleRequest(
      req('/watch-together/refresh', { method: 'POST', body: { roomCode: 'AB12CD', clientId: 'client-abc' } }),
      env
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_a_participant' });
  });

  it('403s when the room does not exist at all', async () => {
    stubFetch(() => new Response('null', { status: 200 }));
    const res = await handleRequest(
      req('/watch-together/refresh', { method: 'POST', body: { roomCode: 'AB12CD', clientId: 'client-abc' } }),
      env
    );
    expect(res.status).toBe(403);
  });

  it('503s when the kill-switch is active', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, true);
    const res = await handleRequest(
      req('/watch-together/refresh', { method: 'POST', body: { roomCode: 'AB12CD', clientId: 'client-abc' } }),
      env
    );
    expect(res.status).toBe(503);
  });

  it('403s a clientId over the max length instead of minting a token for it', async () => {
    const res = await handleRequest(
      req('/watch-together/refresh', { method: 'POST', body: { roomCode: 'AB12CD', clientId: 'x'.repeat(129) } }),
      env
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_a_participant' });
  });

  it('429s after exceeding the refresh rate limit for an IP', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          state: { videoId: 'dQw4w9WgXcQ', currentTime: 0, isPaused: true },
          participants: { 'client-abc': Date.now() },
        }),
        { status: 200 }
      )
    );
    for (let i = 0; i < RATE_LIMITS.refresh; i++) {
      const ok = await handleRequest(
        req('/watch-together/refresh', {
          method: 'POST',
          body: { roomCode: 'AB12CD', clientId: 'client-abc' },
          ip: '203.0.113.4',
        }),
        env
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await handleRequest(
      req('/watch-together/refresh', {
        method: 'POST',
        body: { roomCode: 'AB12CD', clientId: 'client-abc' },
        ip: '203.0.113.4',
      }),
      env
    );
    expect(blocked.status).toBe(429);
    const blockedBody = await blocked.json();
    expect(blockedBody.error).toBe('rate_limited');
    expect(blockedBody.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('GET /watch-together/status', () => {
  it('reports disabled: false by default', async () => {
    const res = await handleRequest(req('/watch-together/status'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disabled: false });
  });

  it('reports disabled: true when the kill-switch is set', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, true);
    const res = await handleRequest(req('/watch-together/status'), env);
    expect(await res.json()).toEqual({ disabled: true });
  });

  it('reports disabled: true (fail-safe) when the KV binding errors', async () => {
    const brokenEnv = {
      ...env,
      WATCH_TOGETHER_KV: {
        get: async () => {
          throw new Error('KV unavailable');
        },
      },
    };
    const res = await handleRequest(req('/watch-together/status'), brokenEnv);
    expect(await res.json()).toEqual({ disabled: true });
  });
});
