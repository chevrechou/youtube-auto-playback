const test = require('node:test');
const assert = require('node:assert');
const { buildZenModeCSS } = require('../lib/zen-mode.js');

test('buildZenModeCSS scopes selectors under the given class name', () => {
  const css = buildZenModeCSS('yt-auto-playback-zen');
  assert.ok(css.includes('.yt-auto-playback-zen #comments'));
  assert.ok(css.includes('.yt-auto-playback-zen #related'));
  assert.ok(css.includes('.yt-auto-playback-zen ytd-watch-next-secondary-results-renderer'));
  assert.ok(css.includes('.yt-auto-playback-zen .ytp-endscreen-content'));
  assert.ok(css.includes('.yt-auto-playback-zen ytd-reel-shelf-renderer'));
});

test('buildZenModeCSS hides matched elements with display: none', () => {
  const css = buildZenModeCSS('zen');
  assert.ok(css.includes('display: none !important'));
});

test('buildZenModeCSS does not target #secondary broadly (would hide live chat/playlist)', () => {
  const css = buildZenModeCSS('zen');
  assert.ok(!css.includes('.zen #secondary '));
  assert.ok(!/\.zen #secondary\s*\{/.test(css));
});
