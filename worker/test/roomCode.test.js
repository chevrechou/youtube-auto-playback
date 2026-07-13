import { describe, it, expect } from 'vitest';
import { generateRoomCode } from '../src/roomCode.js';
import { isValidRoomCode } from '../src/validation.js';

describe('generateRoomCode', () => {
  it('generates codes that pass the room code validator', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });
});
