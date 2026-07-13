// Minimal Firebase Realtime Database REST client.
//
// The worker only ever talks to Firebase for: (a) creating a room doc on
// /watch-together/create, (b) reading a room doc on /join and /refresh, and
// (c) the hourly stale-room cleanup cron. The actual play/pause/seek sync
// traffic goes directly from the extension to Firebase using the minted
// custom token — it never passes through this worker.
//
// All network access is via an injected `fetchFn` (defaults to global fetch)
// so tests can supply a stub instead of hitting a real Firebase project.

import { parseServiceAccount, mintGoogleAccessToken } from './auth.js';

const DATABASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
];

function serviceAccountFrom(env) {
  return parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

async function authedFetch(env, path, options, fetchFn) {
  const serviceAccount = serviceAccountFrom(env);
  const accessToken = await mintGoogleAccessToken(serviceAccount, DATABASE_SCOPES, fetchFn);
  const url = `${env.FIREBASE_DATABASE_URL}${path}`;
  return fetchFn(url, {
    ...options,
    headers: {
      ...(options && options.headers),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * GET /rooms/{roomCode}. Returns the parsed room doc, or null if it doesn't
 * exist (Firebase REST returns literal `null` body for a missing path).
 * Throws on any other failure (network error, non-2xx, bad JSON).
 */
export async function getRoom(env, roomCode, fetchFn = fetch) {
  const response = await authedFetch(env, `/rooms/${roomCode}.json`, { method: 'GET' }, fetchFn);
  if (!response.ok) {
    throw new Error(`Firebase getRoom failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Creates a brand-new room doc with empty participants (the creating client
 * adds itself to /participants directly via Firebase once it has its
 * custom token). Returns true on success; throws on failure so the caller
 * can turn that into a 502 without minting a token.
 */
export async function createRoomDoc(env, roomCode, videoId, fetchFn = fetch) {
  const body = {
    state: {
      videoId,
      currentTime: 0,
      isPaused: true,
      updatedAt: { '.sv': 'timestamp' },
      updatedBy: null,
    },
    participants: {},
  };
  const response = await authedFetch(
    env,
    `/rooms/${roomCode}.json`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    fetchFn
  );
  if (!response.ok) {
    throw new Error(`Firebase createRoomDoc failed: ${response.status}`);
  }
  return true;
}

/**
 * Fetches only rooms whose state/updatedAt is <= cutoffMillis, using
 * Firebase's REST query params rather than downloading the whole /rooms
 * tree. Orders the children of /rooms by their nested state/updatedAt, so
 * requires `.indexOn: ["state/updatedAt"]` declared at the /rooms level
 * itself (see firebase-security-rules.json) — not one level deeper.
 * Returns an object map of { [roomCode]: roomDoc } (possibly empty), never
 * null (Firebase returns null for "no matches" — normalized to {} here).
 */
export async function getStaleRooms(env, cutoffMillis, fetchFn = fetch) {
  const query = `orderBy=${encodeURIComponent('"state/updatedAt"')}&endAt=${cutoffMillis}`;
  const response = await authedFetch(env, `/rooms.json?${query}`, { method: 'GET' }, fetchFn);
  if (!response.ok) {
    throw new Error(`Firebase getStaleRooms failed: ${response.status}`);
  }
  const data = await response.json();
  return data || {};
}

/**
 * Deletes a room doc entirely (used by the cleanup cron).
 */
export async function deleteRoom(env, roomCode, fetchFn = fetch) {
  const response = await authedFetch(env, `/rooms/${roomCode}.json`, { method: 'DELETE' }, fetchFn);
  if (!response.ok) {
    throw new Error(`Firebase deleteRoom failed: ${response.status}`);
  }
  return true;
}
