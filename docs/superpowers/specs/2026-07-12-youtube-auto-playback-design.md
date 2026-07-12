# YouTube Auto-Playback Chrome Extension — Design

## Purpose
Keep YouTube videos playing automatically: resume paused videos and dismiss
"Video paused. Continue watching?" style prompts, without requiring the user
to click anything. Toggleable on/off via the toolbar icon.

## Architecture
Manifest V3 extension, three pieces:
- `manifest.json` — permissions (`storage`), host permission for
  `https://www.youtube.com/*`, content script registration, background
  service worker, toolbar action.
- `background.js` — service worker. Owns the on/off toggle state in
  `chrome.storage.sync` and updates the toolbar badge ("ON"/"OFF") when the
  icon is clicked. No popup — click toggles directly.
- `content.js` — injected into `youtube.com/*` pages. Does the actual work.

## Data flow
Icon click → `background.js` flips `chrome.storage.sync.enabled` → every
open YouTube tab's `content.js` (listening via `chrome.storage.onChanged`)
picks up the new value immediately, no reload needed. State is global, not
per-tab.

## Content script behavior
- Reads `enabled` from storage on load; defaults to `true` on first install.
- YouTube is a single-page app, so navigating between videos doesn't reload
  the page. The script listens for YouTube's own `yt-navigate-finish` event
  (fired on every in-app navigation) to re-check state on the new video.
- Core loop (runs on a ~1s interval while `enabled`):
  1. Find the `<video>` element on the page.
  2. If it exists, is paused, and hasn't ended, call `video.play()`
     (rejections from autoplay policy are caught and ignored — retried next
     tick).
  3. Look for YouTube's "Continue watching?" pause overlay / "are you still
     watching" confirmation dialogs and click their resume button if
     present, as a fallback path to get playback going again.
- Ads are also `<video>` elements and are left alone by the same logic —
  they're allowed to play, just not left sitting paused.
- If no video element is present (e.g. the YouTube homepage), the loop is a
  no-op.

## Icon / badge
Simple play-button glyph icon (16/48/128px). Badge text shows "ON" (green)
or "OFF" (grey) reflecting current global state.

## Testing plan (manual)
Load unpacked via `chrome://extensions` → "Load unpacked":
1. Pause a playing video — confirm it resumes on its own within ~1s.
2. Leave a video idle long enough to trigger the "Continue watching?"
   overlay — confirm it auto-dismisses.
3. Click the toolbar icon to turn it off — confirm badge shows "OFF" and a
   paused video now stays paused.
4. Click again to turn back on — confirm badge shows "ON" and behavior
   resumes.

## Out of scope
- Embedded YouTube videos on non-YouTube sites (youtube.com only).
- Per-tab toggle state (toggle is global).
- Any popup UI beyond the toolbar badge.
