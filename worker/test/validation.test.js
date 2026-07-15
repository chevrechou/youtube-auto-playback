import { describe, it, expect } from 'vitest';
import { isValidVideoId, isValidRoomCode, isValidClientId } from '../src/validation.js';

describe('isValidVideoId', () => {
  it('accepts a well-formed 11-char YouTube video id', () => {
    expect(isValidVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidVideoId('abc-DEF_123')).toBe(true);
  });

  it('rejects wrong-length ids', () => {
    expect(isValidVideoId('short')).toBe(false);
    expect(isValidVideoId('waytoolongvideoid123')).toBe(false);
  });

  it('rejects ids with invalid characters (open-redirect guard)', () => {
    expect(isValidVideoId('javascript:')).toBe(false);
    expect(isValidVideoId('http://evil.')).toBe(false);
    expect(isValidVideoId('abc def_123')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidVideoId(undefined)).toBe(false);
    expect(isValidVideoId(null)).toBe(false);
    expect(isValidVideoId(12345678901)).toBe(false);
  });
});

describe('isValidRoomCode', () => {
  it('accepts a well-formed 6-char uppercase-alphanumeric code', () => {
    expect(isValidRoomCode('AB12CD')).toBe(true);
  });

  it('rejects lowercase, wrong length, or invalid characters', () => {
    expect(isValidRoomCode('ab12cd')).toBe(false);
    expect(isValidRoomCode('AB12C')).toBe(false);
    expect(isValidRoomCode('AB12CDE')).toBe(false);
    expect(isValidRoomCode('AB12C!')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidRoomCode(undefined)).toBe(false);
    expect(isValidRoomCode(123456)).toBe(false);
  });
});

describe('isValidClientId', () => {
  it('accepts a realistic client id', () => {
    expect(isValidClientId('client-abc123-1700000000000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidClientId('')).toBe(false);
  });

  it('accepts exactly the max length and rejects one over it', () => {
    expect(isValidClientId('x'.repeat(128))).toBe(true);
    expect(isValidClientId('x'.repeat(129))).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidClientId(undefined)).toBe(false);
    expect(isValidClientId(null)).toBe(false);
    expect(isValidClientId(12345)).toBe(false);
  });
});
