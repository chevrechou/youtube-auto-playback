const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARSET[Math.floor(Math.random() * ROOM_CODE_CHARSET.length)];
  }
  return code;
}

function isValidRoomCode(code) {
  return typeof code === 'string' && new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`).test(code);
}

// Matches YouTube's real video id format. The Worker has its own
// authoritative copy of this same regex — this client-side check is
// defense in depth only, not the source of truth.
function isValidVideoId(videoId) {
  return typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId);
}

function shouldApplyUpdate(update, ownClientId) {
  return Boolean(update) && update.updatedBy !== ownClientId;
}

function isParticipantStale(lastSeen, now, timeoutMs) {
  return now - lastSeen > timeoutMs;
}

function isRoomFull(participants, excludeClientId, now, timeoutMs = 60000) {
  const activeOthers = Object.entries(participants || {}).filter(
    ([clientId, lastSeen]) => clientId !== excludeClientId && !isParticipantStale(lastSeen, now, timeoutMs)
  );
  return activeOthers.length >= 2;
}

function isFirebaseConfigured(databaseUrl) {
  return typeof databaseUrl === 'string' && databaseUrl.trim().length > 0;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateRoomCode,
    isValidRoomCode,
    isValidVideoId,
    shouldApplyUpdate,
    isRoomFull,
    isParticipantStale,
    isFirebaseConfigured,
  };
}
