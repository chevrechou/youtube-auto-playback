// Hourly stale-room cleanup (see wrangler.toml `[triggers]`).
//
// Deletes room docs whose state/updatedAt is older than 24 hours. Uses
// Firebase's REST query params (orderBy + endAt) to fetch only the stale
// rooms rather than downloading the entire /rooms tree. The query orders
// the CHILDREN OF /rooms (each room) by their nested state/updatedAt value,
// so the index must be declared at the /rooms level itself, not one level
// deeper — see firebase-security-rules.json:
//   "rooms": { ".indexOn": ["state/updatedAt"], "$roomCode": {...} }
// Without it, Firebase will still serve the query but will emit a
// ".indexOn" warning and do an expensive unindexed scan.

import { getStaleRooms, deleteRoom } from './firebase.js';

export const STALE_ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupStaleRooms(env, fetchFn = fetch, now = Date.now()) {
  const cutoff = now - STALE_ROOM_MAX_AGE_MS;
  const staleRooms = await getStaleRooms(env, cutoff, fetchFn);
  const roomCodes = Object.keys(staleRooms);

  const results = await Promise.allSettled(
    roomCodes.map((roomCode) => deleteRoom(env, roomCode, fetchFn))
  );

  const deleted = [];
  const failed = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      deleted.push(roomCodes[i]);
    } else {
      failed.push(roomCodes[i]);
    }
  });

  console.log(
    JSON.stringify({
      event: 'watch_together_cleanup',
      cutoff,
      candidates: roomCodes.length,
      deleted: deleted.length,
      failed: failed.length,
    })
  );

  return { deleted, failed };
}
