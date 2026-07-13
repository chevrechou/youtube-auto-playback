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

if (typeof module !== 'undefined') {
  module.exports = {
    generateRoomCode,
    isValidRoomCode,
    shouldApplyUpdate,
    isRoomFull,
    isParticipantStale,
  };
}
