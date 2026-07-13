import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { getRoom, createRoomDoc, getStaleRooms, deleteRoom } from '../src/firebase.js';

// All tests here inject a fake fetchFn — no real network / Firebase project
// is touched. Every call also transparently goes through mintGoogleAccessToken
// first (the OAuth token exchange), so the fake fetchFn must handle both the
// token endpoint call and the actual RTDB REST call.
function fakeFetch(handleRtdbCall) {
  return vi.fn(async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), {
        status: 200,
      });
    }
    return handleRtdbCall(url, options);
  });
}

describe('getRoom', () => {
  it('returns null when Firebase responds with literal null (room does not exist)', async () => {
    const fetchFn = fakeFetch(async (url) => {
      expect(url).toBe(`${env.FIREBASE_DATABASE_URL}/rooms/AB12CD.json`);
      return new Response('null', { status: 200 });
    });
    const room = await getRoom(env, 'AB12CD', fetchFn);
    expect(room).toBeNull();
  });

  it('returns the parsed room doc when it exists', async () => {
    const doc = { state: { videoId: 'dQw4w9WgXcQ', currentTime: 12, isPaused: false }, participants: {} };
    const fetchFn = fakeFetch(async () => new Response(JSON.stringify(doc), { status: 200 }));
    const room = await getRoom(env, 'AB12CD', fetchFn);
    expect(room).toEqual(doc);
  });

  it('throws on a non-2xx response (Firebase unavailable)', async () => {
    const fetchFn = fakeFetch(async () => new Response('boom', { status: 500 }));
    await expect(getRoom(env, 'AB12CD', fetchFn)).rejects.toThrow();
  });
});

describe('createRoomDoc', () => {
  it('PUTs the documented room shape including server-timestamp sentinel', async () => {
    const fetchFn = fakeFetch(async (url, options) => {
      expect(url).toBe(`${env.FIREBASE_DATABASE_URL}/rooms/AB12CD.json`);
      expect(options.method).toBe('PUT');
      const body = JSON.parse(options.body);
      expect(body.state.videoId).toBe('dQw4w9WgXcQ');
      expect(body.state.currentTime).toBe(0);
      expect(body.state.isPaused).toBe(true);
      expect(body.state.updatedAt).toEqual({ '.sv': 'timestamp' });
      expect(body.participants).toEqual({});
      return new Response('{}', { status: 200 });
    });
    await expect(createRoomDoc(env, 'AB12CD', 'dQw4w9WgXcQ', fetchFn)).resolves.toBe(true);
  });

  it('throws when the write fails (caller must not mint a token in that case)', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 500 }));
    await expect(createRoomDoc(env, 'AB12CD', 'dQw4w9WgXcQ', fetchFn)).rejects.toThrow();
  });
});

describe('getStaleRooms', () => {
  it('queries with orderBy=state/updatedAt and endAt=cutoff, not the whole /rooms tree', async () => {
    const fetchFn = fakeFetch(async (url) => {
      expect(url).toContain(`${env.FIREBASE_DATABASE_URL}/rooms.json?`);
      expect(url).toContain('orderBy=');
      expect(url).toContain(encodeURIComponent('"state/updatedAt"'));
      expect(url).toContain('endAt=1000');
      return new Response(JSON.stringify({ AB12CD: { state: { updatedAt: 500 } } }), { status: 200 });
    });
    const rooms = await getStaleRooms(env, 1000, fetchFn);
    expect(rooms).toEqual({ AB12CD: { state: { updatedAt: 500 } } });
  });

  it('normalizes a null response (no stale rooms) to an empty object', async () => {
    const fetchFn = fakeFetch(async () => new Response('null', { status: 200 }));
    const rooms = await getStaleRooms(env, 1000, fetchFn);
    expect(rooms).toEqual({});
  });
});

describe('deleteRoom', () => {
  it('sends a DELETE request for the room path', async () => {
    const fetchFn = fakeFetch(async (url, options) => {
      expect(url).toBe(`${env.FIREBASE_DATABASE_URL}/rooms/AB12CD.json`);
      expect(options.method).toBe('DELETE');
      return new Response('{}', { status: 200 });
    });
    await expect(deleteRoom(env, 'AB12CD', fetchFn)).resolves.toBe(true);
  });
});
