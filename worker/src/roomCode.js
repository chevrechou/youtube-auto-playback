// Room code generation. Duplicates generateRoomCode() from the main extension
// repo's lib/watch-together-logic.js (separate deployable codebase — keep in
// sync manually). Cross-reference: ../../lib/watch-together-logic.js

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARSET[Math.floor(Math.random() * ROOM_CODE_CHARSET.length)];
  }
  return code;
}
