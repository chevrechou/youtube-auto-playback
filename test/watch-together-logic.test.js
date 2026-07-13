const test = require('node:test');
const assert = require('node:assert');
const {
  generateRoomCode,
  isValidRoomCode,
  isValidVideoId,
  shouldApplyUpdate,
  isRoomFull,
  isParticipantStale,
  isFirebaseConfigured,
} = require('../lib/watch-together-logic.js');

test('generateRoomCode returns a 6-character uppercase alphanumeric code', () => {
  const code = generateRoomCode();
  assert.strictEqual(code.length, 6);
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('generateRoomCode produces different codes across calls (not constant)', () => {
  const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
  assert.ok(codes.size > 1);
});

test('isValidRoomCode accepts a well-formed 6-char alphanumeric code', () => {
  assert.strictEqual(isValidRoomCode('7F3K9Q'), true);
});

test('isValidRoomCode rejects wrong length', () => {
  assert.strictEqual(isValidRoomCode('7F3K9'), false);
  assert.strictEqual(isValidRoomCode('7F3K9QQ'), false);
});

test('isValidRoomCode rejects non-alphanumeric characters', () => {
  assert.strictEqual(isValidRoomCode('7F3K9-'), false);
});

test('isValidRoomCode rejects empty string', () => {
  assert.strictEqual(isValidRoomCode(''), false);
});

test('isValidVideoId accepts an 11-character YouTube video id', () => {
  assert.strictEqual(isValidVideoId('dQw4w9WgXcQ'), true);
});

test('isValidVideoId accepts ids containing underscores and hyphens', () => {
  assert.strictEqual(isValidVideoId('a_B-9zZ01_-'), true);
});

test('isValidVideoId rejects wrong length', () => {
  assert.strictEqual(isValidVideoId('short'), false);
  assert.strictEqual(isValidVideoId('waytoolongvideoid123'), false);
});

test('isValidVideoId rejects disallowed characters', () => {
  assert.strictEqual(isValidVideoId('dQw4w9Wg!cQ'), false);
});

test('isValidVideoId rejects non-string input', () => {
  assert.strictEqual(isValidVideoId(null), false);
  assert.strictEqual(isValidVideoId(undefined), false);
  assert.strictEqual(isValidVideoId(12345678901), false);
});

test('isValidVideoId rejects empty string', () => {
  assert.strictEqual(isValidVideoId(''), false);
});

test('shouldApplyUpdate returns true when updatedBy differs from own client id', () => {
  assert.strictEqual(shouldApplyUpdate({ updatedBy: 'peer-1' }, 'peer-2'), true);
});

test('shouldApplyUpdate returns false for an echoed update (own client id)', () => {
  assert.strictEqual(shouldApplyUpdate({ updatedBy: 'peer-1' }, 'peer-1'), false);
});

test('isRoomFull returns false when fewer than 2 other active participants', () => {
  const now = 1000000;
  const participants = { 'peer-1': now };
  assert.strictEqual(isRoomFull(participants, 'peer-2', now), false);
});

test('isRoomFull returns true when 2 other active participants already present', () => {
  const now = 1000000;
  const participants = { 'peer-1': now, 'peer-2': now };
  assert.strictEqual(isRoomFull(participants, 'peer-3', now), true);
});

test('isRoomFull excludes the caller\'s own id from the count', () => {
  const now = 1000000;
  const participants = { 'peer-1': now, 'peer-2': now };
  assert.strictEqual(isRoomFull(participants, 'peer-1', now), false);
});

test('isRoomFull ignores stale (timed-out) participants', () => {
  const now = 1000000;
  const participants = { 'peer-1': now - 100000, 'peer-2': now };
  assert.strictEqual(isRoomFull(participants, 'peer-3', now), false);
});

test('isParticipantStale returns true when lastSeen is older than the timeout', () => {
  assert.strictEqual(isParticipantStale(1000, 62000, 60000), true);
});

test('isParticipantStale returns false when lastSeen is within the timeout', () => {
  assert.strictEqual(isParticipantStale(1000, 30000, 60000), false);
});

test('isFirebaseConfigured returns false for the empty-string placeholder', () => {
  assert.strictEqual(isFirebaseConfigured(''), false);
});

test('isFirebaseConfigured returns false for whitespace-only value', () => {
  assert.strictEqual(isFirebaseConfigured('   '), false);
});

test('isFirebaseConfigured returns true for a real database URL', () => {
  assert.strictEqual(isFirebaseConfigured('https://my-project-default-rtdb.firebaseio.com'), true);
});
