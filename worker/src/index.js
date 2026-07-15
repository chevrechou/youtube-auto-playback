// Watch Together backend — routing.
//
// This worker gatekeeps room creation/joining (validation, rate limiting,
// kill-switch, minting scoped Firebase custom tokens). It does NOT proxy the
// real-time play/pause/seek sync traffic — that goes directly from the
// extension to Firebase Realtime Database using the custom token minted
// here, so Firebase's native push-based sync (no polling) is preserved.
//
// Route contract (must match the separately-built extension client exactly —
// see the task brief this was built against):
//   POST /watch-together/create   { videoId } -> { roomCode, customToken }
//   POST /watch-together/join     { roomCode } -> { customToken, videoId, currentTime, isPaused }
//   POST /watch-together/refresh  { roomCode, clientId } -> { customToken }
//   GET  /watch-together/status   -> { disabled }
//
// NOTE ON UNDOCUMENTED FAILURE CASES: the contract given to us doesn't define
// a status code for "Firebase itself is unreachable" on /join or /refresh
// (only /create documents 502 backend_unavailable). We reuse 502
// {error: "backend_unavailable"} for those cases too, since it's the same
// underlying condition and self-describing — flagged here for the client
// team in case they want an explicit branch for it.

import { isValidVideoId, isValidRoomCode, isValidClientId } from './validation.js';
import { generateRoomCode } from './roomCode.js';
import { checkRateLimit } from './rateLimit.js';
import { isServiceDisabled, recordSigningFailure, recordSigningSuccess } from './killSwitch.js';
import { parseServiceAccount, mintCustomToken } from './auth.js';
import { getRoom, createRoomDoc } from './firebase.js';
import { cleanupStaleRooms } from './cron.js';

const ACTIVE_PARTICIPANT_TIMEOUT_MS = 60 * 1000;
const MAX_ROOM_CODE_ATTEMPTS = 5;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

function countActiveParticipants(participants, now) {
  return Object.values(participants || {}).filter(
    (lastSeen) => typeof lastSeen === 'number' && now - lastSeen <= ACTIVE_PARTICIPANT_TIMEOUT_MS
  ).length;
}

/**
 * Mints a custom token, tracking consecutive signing failures for the
 * kill-switch breaker. Returns the token on success, or null on failure
 * (caller is responsible for responding — typically 502).
 */
async function mintTokenOrNull(env, serviceAccount, uid, claims) {
  try {
    const token = await mintCustomToken(serviceAccount, uid, claims);
    await recordSigningSuccess(env.WATCH_TOGETHER_KV);
    return token;
  } catch (err) {
    console.log(JSON.stringify({ event: 'signing_failed', error: String(err && err.message) }));
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    return null;
  }
}

async function handleCreate(request, env) {
  const disabled = await isServiceDisabled(env.WATCH_TOGETHER_KV);
  if (disabled) return json(503, { error: 'service_disabled' });

  const body = await readJsonBody(request);
  if (!isValidVideoId(body.videoId)) {
    return json(400, { error: 'invalid_video_id' });
  }

  const ip = clientIp(request);
  const rateLimitResult = await checkRateLimit(env.WATCH_TOGETHER_KV, 'create', ip);
  if (!rateLimitResult.allowed) {
    return json(429, { error: 'rate_limited', retryAfterSeconds: rateLimitResult.retryAfterSeconds });
  }

  let serviceAccount;
  try {
    serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    console.log(JSON.stringify({ event: 'service_account_unparseable', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  let roomCode = null;
  try {
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
      const candidate = generateRoomCode();
      const existing = await getRoom(env, candidate);
      if (existing === null) {
        roomCode = candidate;
        break;
      }
    }
  } catch (err) {
    console.log(JSON.stringify({ event: 'firebase_read_failed', where: 'create_collision_check', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  if (!roomCode) {
    console.log(JSON.stringify({ event: 'room_code_exhausted' }));
    return json(502, { error: 'backend_unavailable' });
  }

  try {
    await createRoomDoc(env, roomCode, body.videoId);
  } catch (err) {
    console.log(JSON.stringify({ event: 'firebase_write_failed', where: 'create', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  const uid = crypto.randomUUID();
  const customToken = await mintTokenOrNull(env, serviceAccount, uid, { roomCode });
  if (!customToken) {
    return json(502, { error: 'backend_unavailable' });
  }

  return json(200, { roomCode, customToken });
}

async function handleJoin(request, env) {
  const disabled = await isServiceDisabled(env.WATCH_TOGETHER_KV);
  if (disabled) return json(503, { error: 'service_disabled' });

  const body = await readJsonBody(request);
  if (!isValidRoomCode(body.roomCode)) {
    return json(400, { error: 'invalid_room_code' });
  }

  const ip = clientIp(request);
  const rateLimitResult = await checkRateLimit(env.WATCH_TOGETHER_KV, 'join', ip);
  if (!rateLimitResult.allowed) {
    return json(429, { error: 'rate_limited', retryAfterSeconds: rateLimitResult.retryAfterSeconds });
  }

  let serviceAccount;
  try {
    serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    console.log(JSON.stringify({ event: 'service_account_unparseable', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  let room;
  try {
    room = await getRoom(env, body.roomCode);
  } catch (err) {
    console.log(JSON.stringify({ event: 'firebase_read_failed', where: 'join', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  if (room === null) {
    return json(404, { error: 'room_not_found' });
  }

  const activeCount = countActiveParticipants(room.participants, Date.now());
  if (activeCount >= 2) {
    return json(409, { error: 'room_full' });
  }

  const uid = crypto.randomUUID();
  const customToken = await mintTokenOrNull(env, serviceAccount, uid, { roomCode: body.roomCode });
  if (!customToken) {
    return json(502, { error: 'backend_unavailable' });
  }

  const state = room.state || {};
  return json(200, {
    customToken,
    videoId: typeof state.videoId === 'string' ? state.videoId : null,
    currentTime: typeof state.currentTime === 'number' ? state.currentTime : 0,
    isPaused: typeof state.isPaused === 'boolean' ? state.isPaused : true,
  });
}

async function handleRefresh(request, env) {
  const disabled = await isServiceDisabled(env.WATCH_TOGETHER_KV);
  if (disabled) return json(503, { error: 'service_disabled' });

  const body = await readJsonBody(request);
  const { roomCode, clientId } = body;

  if (!isValidRoomCode(roomCode) || !isValidClientId(clientId)) {
    // Not in the documented contract for /refresh (only 403/503 are
    // specified) — malformed input can't correspond to a real participant
    // either way, so we fold it into the same "not a participant" response.
    return json(403, { error: 'not_a_participant' });
  }

  const ip = clientIp(request);
  const rateLimitResult = await checkRateLimit(env.WATCH_TOGETHER_KV, 'refresh', ip);
  if (!rateLimitResult.allowed) {
    return json(429, { error: 'rate_limited', retryAfterSeconds: rateLimitResult.retryAfterSeconds });
  }

  let serviceAccount;
  try {
    serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    console.log(JSON.stringify({ event: 'service_account_unparseable', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  let room;
  try {
    room = await getRoom(env, roomCode);
  } catch (err) {
    console.log(JSON.stringify({ event: 'firebase_read_failed', where: 'refresh', error: String(err && err.message) }));
    return json(502, { error: 'backend_unavailable' });
  }

  const participants = (room && room.participants) || {};
  if (!Object.prototype.hasOwnProperty.call(participants, clientId)) {
    return json(403, { error: 'not_a_participant' });
  }

  const uid = `wt:${clientId}`;
  const customToken = await mintTokenOrNull(env, serviceAccount, uid, { roomCode });
  if (!customToken) {
    return json(502, { error: 'backend_unavailable' });
  }

  return json(200, { customToken });
}

async function handleStatus(env) {
  const disabled = await isServiceDisabled(env.WATCH_TOGETHER_KV);
  return json(200, { disabled });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (!url.pathname.startsWith('/watch-together/')) {
    return json(404, { error: 'not_found' });
  }

  if (request.method === 'POST' && url.pathname === '/watch-together/create') {
    return handleCreate(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/watch-together/join') {
    return handleJoin(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/watch-together/refresh') {
    return handleRefresh(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/watch-together/status') {
    return handleStatus(env);
  }

  return json(404, { error: 'not_found' });
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupStaleRooms(env));
  },
};
