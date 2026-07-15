// Validation patterns for Watch Together requests.
//
// These intentionally duplicate the patterns in the main extension repo's
// lib/watch-together-logic.js (isValidRoomCode) — this worker is a separate
// deployable codebase (no shared package/build step with the extension), so
// the regexes are copy-pasted rather than imported. If you change one, change
// the other. Cross-reference: ../../lib/watch-together-logic.js

// YouTube's real video ID format: 11 chars, base64url-ish alphabet.
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Room codes are 6 uppercase-alphanumeric chars (see generateRoomCode in
// ../../lib/watch-together-logic.js for the generator that produces these).
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function isValidVideoId(videoId) {
  return typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId);
}

export function isValidRoomCode(roomCode) {
  return typeof roomCode === 'string' && ROOM_CODE_PATTERN.test(roomCode);
}

// Real client IDs (see randomClientId() in ../../watch-together.js) are
// well under 64 chars. The cap exists to bound the size of attacker-supplied
// input on the unauthenticated /refresh route, not to fit a realistic ID.
const MAX_CLIENT_ID_LENGTH = 128;

export function isValidClientId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CLIENT_ID_LENGTH;
}
