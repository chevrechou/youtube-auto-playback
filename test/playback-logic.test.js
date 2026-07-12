const test = require('node:test');
const assert = require('node:assert');
const { isVideoResumable, findResumeButton } = require('../lib/playback-logic.js');

test('isVideoResumable returns true for a paused, not-ended video', () => {
  assert.strictEqual(isVideoResumable({ paused: true, ended: false }), true);
});

test('isVideoResumable returns false for a playing video', () => {
  assert.strictEqual(isVideoResumable({ paused: false, ended: false }), false);
});

test('isVideoResumable returns false for an ended video', () => {
  assert.strictEqual(isVideoResumable({ paused: true, ended: true }), false);
});

test('isVideoResumable returns false when there is no video', () => {
  assert.strictEqual(isVideoResumable(null), false);
});

test('findResumeButton finds a visible button labeled "Resume"', () => {
  const button = {
    getAttribute: (name) => (name === 'aria-label' ? 'Resume' : null),
    textContent: '',
    offsetParent: {},
  };
  const root = { querySelectorAll: () => [button] };
  assert.strictEqual(findResumeButton(root), button);
});

test('findResumeButton finds a button by text content ("Yes")', () => {
  const button = { getAttribute: () => null, textContent: 'Yes', offsetParent: {} };
  const root = { querySelectorAll: () => [button] };
  assert.strictEqual(findResumeButton(root), button);
});

test('findResumeButton skips hidden buttons', () => {
  const hidden = {
    getAttribute: (name) => (name === 'aria-label' ? 'Resume' : null),
    textContent: '',
    offsetParent: null,
  };
  const root = { querySelectorAll: () => [hidden] };
  assert.strictEqual(findResumeButton(root), null);
});

test('findResumeButton returns null when nothing matches', () => {
  const other = { getAttribute: () => null, textContent: 'Share', offsetParent: {} };
  const root = { querySelectorAll: () => [other] };
  assert.strictEqual(findResumeButton(root), null);
});
