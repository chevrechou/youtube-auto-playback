import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { cleanupStaleRooms, STALE_ROOM_MAX_AGE_MS } from '../src/cron.js';

function fakeFetch({ onQuery, onDelete }) {
  return vi.fn(async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), {
        status: 200,
      });
    }
    if (options && options.method === 'DELETE') {
      return onDelete(url);
    }
    return onQuery(url);
  });
}

describe('cleanupStaleRooms', () => {
  it('deletes every room returned by the stale-rooms query and none others', async () => {
    const now = 1_000_000_000_000;
    const deleted = [];
    const fetchFn = fakeFetch({
      onQuery: (url) => {
        expect(url).toContain(`endAt=${now - STALE_ROOM_MAX_AGE_MS}`);
        return new Response(
          JSON.stringify({
            OLD001: { state: { updatedAt: now - STALE_ROOM_MAX_AGE_MS - 1000 } },
            OLD002: { state: { updatedAt: now - STALE_ROOM_MAX_AGE_MS - 5000 } },
          }),
          { status: 200 }
        );
      },
      onDelete: (url) => {
        deleted.push(url);
        return new Response('{}', { status: 200 });
      },
    });

    const result = await cleanupStaleRooms(env, fetchFn, now);
    expect(result.deleted.sort()).toEqual(['OLD001', 'OLD002']);
    expect(deleted).toHaveLength(2);
  });

  it('does nothing when there are no stale rooms', async () => {
    const fetchFn = fakeFetch({
      onQuery: () => new Response('null', { status: 200 }),
      onDelete: () => new Response('{}', { status: 200 }),
    });
    const result = await cleanupStaleRooms(env, fetchFn, Date.now());
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('reports per-room failures without throwing, so one bad delete does not abort the batch', async () => {
    const fetchFn = fakeFetch({
      onQuery: () =>
        new Response(
          JSON.stringify({
            GOOD01: { state: { updatedAt: 1 } },
            BAD002: { state: { updatedAt: 1 } },
          }),
          { status: 200 }
        ),
      onDelete: (url) => {
        if (url.includes('BAD002')) {
          return new Response('boom', { status: 500 });
        }
        return new Response('{}', { status: 200 });
      },
    });

    const result = await cleanupStaleRooms(env, fetchFn, Date.now());
    expect(result.deleted).toEqual(['GOOD01']);
    expect(result.failed).toEqual(['BAD002']);
  });
});
