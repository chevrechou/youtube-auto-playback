# YouTube Auto-Playback Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that keeps YouTube videos playing (auto-resumes paused videos, dismisses "Continue watching?" prompts) and can be toggled on/off via the toolbar icon.

**Architecture:** A background service worker owns a global on/off flag in `chrome.storage.sync` and updates the toolbar badge. A content script injected on `youtube.com/*` polls on a 1s interval (plus YouTube's `yt-navigate-finish` SPA event) to resume paused video and dismiss pause overlays. Pure decision logic lives in a separate library file so it's unit-testable with Node's built-in test runner, independent of the DOM/chrome APIs.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, Node.js built-in `node:test` for unit tests, Python 3 + Pillow for one-time icon generation.

## Global Constraints
- Manifest V3 only.
- Applies to `https://www.youtube.com/*` only (no embedded-iframe support elsewhere).
- Toggle state is global (not per-tab), stored in `chrome.storage.sync` under key `enabled`, default `true`.
- No popup UI — the toolbar icon click itself toggles state; badge text shows "ON"/"OFF".
- Only permission requested: `storage`. Only host permission: `https://www.youtube.com/*`.

---

### Task 1: Extension icons

**Files:**
- Create: `scripts/generate_icons.py`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (generated output)

**Interfaces:**
- Produces: three PNG files at `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`, referenced by `manifest.json` in Task 2.

- [ ] **Step 1: Write the icon generator script**

```python
# scripts/generate_icons.py
from PIL import Image, ImageDraw

SIZES = (16, 48, 128)
BG_COLOR = (204, 0, 0, 255)      # YouTube-red circle
FG_COLOR = (255, 255, 255, 255)  # white play triangle

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, size - 1, size - 1], fill=BG_COLOR)

    tri_w = size * 0.4
    tri_h = size * 0.5
    cx, cy = size / 2, size / 2
    points = [
        (cx - tri_w / 2 + size * 0.05, cy - tri_h / 2),
        (cx - tri_w / 2 + size * 0.05, cy + tri_h / 2),
        (cx + tri_w / 2, cy),
    ]
    draw.polygon(points, fill=FG_COLOR)
    return img

if __name__ == "__main__":
    for size in SIZES:
        icon = make_icon(size)
        path = f"icons/icon{size}.png"
        icon.save(path)
        print(f"Wrote {path}")
```

- [ ] **Step 2: Run the script**

Run: `cd ~/youtube-auto-playback && python3 scripts/generate_icons.py`
Expected output:
```
Wrote icons/icon16.png
Wrote icons/icon48.png
Wrote icons/icon128.png
```

- [ ] **Step 3: Verify the files exist**

Run: `ls -la icons/`
Expected: three files, `icon16.png`, `icon48.png`, `icon128.png`, each with non-zero size.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_icons.py icons/icon16.png icons/icon48.png icons/icon128.png
git commit -m "Add generated toolbar icons"
```

---

### Task 2: Manifest

**Files:**
- Create: `manifest.json`

**Interfaces:**
- Consumes: icon paths from Task 1 (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`).
- Produces: content script registration referencing `lib/playback-logic.js` and `content.js` (created in Tasks 3–4), and background registration referencing `background.js` (created in Task 5). These files don't need to exist yet for this task — Chrome only reads the manifest when the extension is actually loaded, which happens in Task 6.

- [ ] **Step 1: Write manifest.json**

```json
{
  "manifest_version": 3,
  "name": "YouTube Auto-Playback",
  "version": "1.0.0",
  "description": "Keeps YouTube videos playing automatically and dismisses pause prompts.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["lib/playback-logic.js", "content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `python3 -m json.tool manifest.json > /dev/null && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "Add extension manifest"
```

---

### Task 3: Playback decision library (TDD)

**Files:**
- Create: `test/playback-logic.test.js`
- Create: `lib/playback-logic.js`

**Interfaces:**
- Produces: `isVideoResumable(video)` → `boolean`, `findResumeButton(root)` → `Element|null`. Both are attached as browser globals when loaded as a content script (no `export`/`module.exports` executes in that context), and also exported via `module.exports` for Node's test runner. `content.js` (Task 4) calls both by name directly (as globals, since it's loaded after this file in the same content-script context).

- [ ] **Step 1: Write the failing tests**

```js
// test/playback-logic.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/youtube-auto-playback && node --test test/`
Expected: FAIL — `Cannot find module '../lib/playback-logic.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/playback-logic.js
function isVideoResumable(video) {
  return Boolean(video) && video.paused === true && video.ended === false;
}

function findResumeButton(root) {
  const nodes = root.querySelectorAll('button, .ytp-play-button');
  for (const el of nodes) {
    const ariaLabel = (el.getAttribute && el.getAttribute('aria-label')) || '';
    const text = el.textContent || '';
    const label = (ariaLabel || text).trim().toLowerCase();
    const isResumeLabel = label === 'play' || label === 'resume' || label.includes('yes');
    const isVisible = el.offsetParent !== null && el.offsetParent !== undefined;
    if (isResumeLabel && isVisible) {
      return el;
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { isVideoResumable, findResumeButton };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all 7 tests pass (`# pass 7`, `# fail 0`)

- [ ] **Step 5: Commit**

```bash
git add lib/playback-logic.js test/playback-logic.test.js
git commit -m "Add playback decision library with unit tests"
```

---

### Task 4: Content script

**Files:**
- Create: `content.js`

**Interfaces:**
- Consumes: `isVideoResumable(video)` and `findResumeButton(root)` from Task 3 (available as globals since `lib/playback-logic.js` loads first per manifest).
- Consumes: `chrome.storage.sync` (key `enabled`, default `true`) written by `background.js` (Task 5).

- [ ] **Step 1: Write content.js**

```js
// content.js
(function () {
  const CHECK_INTERVAL_MS = 1000;
  let enabled = true;
  let intervalId = null;

  function tick() {
    if (!enabled) return;
    const video = document.querySelector('video');
    if (isVideoResumable(video)) {
      video.play().catch(() => {});
    }
    const resumeButton = findResumeButton(document);
    if (resumeButton) {
      resumeButton.click();
    }
  }

  function start() {
    if (intervalId === null) {
      tick();
      intervalId = setInterval(tick, CHECK_INTERVAL_MS);
    }
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function applyEnabledState(value) {
    enabled = value;
    if (enabled) {
      start();
    } else {
      stop();
    }
  }

  chrome.storage.sync.get({ enabled: true }, (result) => {
    applyEnabledState(result.enabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
      applyEnabledState(changes.enabled.newValue);
    }
  });

  document.addEventListener('yt-navigate-finish', tick);
})();
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check content.js`
Expected: no output (clean exit means valid syntax; `chrome`/`document` are runtime globals resolved only in the browser, so this step only confirms parse-level correctness).

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "Add content script for auto-resume and pause-overlay dismissal"
```

---

### Task 5: Background service worker

**Files:**
- Create: `background.js`

**Interfaces:**
- Produces: `chrome.storage.sync` key `enabled` (boolean, default `true`), read by `content.js` (Task 4).

- [ ] **Step 1: Write background.js**

```js
// background.js
const DEFAULT_ENABLED = true;

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#2e7d32' : '#757575' });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    chrome.storage.sync.set({ enabled: result.enabled });
    setBadge(result.enabled);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    const next = !result.enabled;
    chrome.storage.sync.set({ enabled: next });
    setBadge(next);
  });
});

chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
  setBadge(result.enabled);
});
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check background.js`
Expected: no output (clean exit).

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "Add background service worker for toggle and badge state"
```

---

### Task 6: README and manual QA

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing new — this task documents and manually verifies the fully assembled extension from Tasks 1–5.

- [ ] **Step 1: Write README.md**

```markdown
# YouTube Auto-Playback

Keeps YouTube videos playing automatically: resumes paused videos and
dismisses "Continue watching?" prompts. Toggle on/off by clicking the
toolbar icon (badge shows ON/OFF).

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked".
4. Select this folder (`youtube-auto-playback`).

## Manual test checklist

1. Open a YouTube video, let it play, then pause it — it should resume on
   its own within ~1 second.
2. Leave a video idle until the "Continue watching?" overlay appears —
   it should auto-dismiss.
3. Click the toolbar icon — badge should switch to "OFF"; pause a video
   and confirm it now stays paused.
4. Click the toolbar icon again — badge should switch back to "ON"; confirm
   auto-resume behavior returns.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with install and manual QA instructions"
```

- [ ] **Step 3: Load the extension in Chrome and run the manual QA checklist**

Follow the "Install (unpacked)" and "Manual test checklist" steps in
`README.md` above. This is the final acceptance check for the whole
extension — no further automated test can substitute for actually watching
a video pause, resume, and toggle in real Chrome.
