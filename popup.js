document.addEventListener('DOMContentLoaded', () => {
  const errorEl = document.getElementById('error');
  const rowsEl = document.getElementById('rows');
  const enabledSwitch = document.getElementById('enabled-switch');
  const zenSwitch = document.getElementById('zen-switch');
  const footerEl = document.getElementById('footer');

  footerEl.textContent = `v${chrome.runtime.getManifest().version}`;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    rowsEl.hidden = true;
  }

  function setLoaded() {
    rowsEl.classList.remove('loading');
    enabledSwitch.disabled = false;
    zenSwitch.disabled = false;
  }

  function writeToggle(key, value) {
    chrome.storage.sync.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        showError("Couldn't save your change. Try again.");
      }
    });
  }

  chrome.storage.sync.get({ enabled: true, zenModeEnabled: false }, (result) => {
    if (chrome.runtime.lastError) {
      showError("Couldn't load settings. Try reopening this popup.");
      return;
    }
    enabledSwitch.checked = result.enabled;
    zenSwitch.checked = result.zenModeEnabled;
    setLoaded();
  });

  enabledSwitch.addEventListener('change', () => {
    writeToggle('enabled', enabledSwitch.checked);
  });

  zenSwitch.addEventListener('change', () => {
    writeToggle('zenModeEnabled', zenSwitch.checked);
  });

  // --- Watch Together ---
  const wtErrorBox = document.getElementById('wt-error-box');
  const wtDisabledBox = document.getElementById('wt-disabled-box');
  const wtIdle = document.getElementById('wt-idle');
  const wtActive = document.getElementById('wt-active');
  const wtCreateBtn = document.getElementById('wt-create-btn');
  const wtJoinInput = document.getElementById('wt-join-input');
  const wtJoinBtn = document.getElementById('wt-join-btn');
  const wtCodeText = document.getElementById('wt-code-text');
  const wtCopyBtn = document.getElementById('wt-copy-btn');
  const wtShareBtn = document.getElementById('wt-share-btn');
  const wtStatusDot = document.getElementById('wt-status-dot');
  const wtStatusText = document.getElementById('wt-status-text');
  const wtRegenerateBtn = document.getElementById('wt-regenerate-btn');
  const wtLeaveBtn = document.getElementById('wt-leave-btn');
  const wtDeepLinkBanner = document.getElementById('wt-deep-link-banner');
  const wtDeepLinkText = document.getElementById('wt-deep-link-text');
  const wtDeepLinkConfirmBtn = document.getElementById('wt-deep-link-confirm-btn');
  const wtDeepLinkDismissBtn = document.getElementById('wt-deep-link-dismiss-btn');

  let watchTogetherDisabled = false;

  const ERROR_MESSAGES = {
    connectivity: "Couldn't connect. Check your connection and try again.",
    invalid_video_id: "This doesn't look like a YouTube video page. Open a video first.",
    invalid_room_code: "That room code doesn't look right. Check it and try again.",
    backend_unavailable: "Watch Together's servers are having trouble. Try again shortly.",
    service_disabled: 'Watch Together is temporarily unavailable.',
    room_not_found: 'Room not found. Check the code and try again.',
    room_full: 'Room is full.',
    not_a_participant: "You've been disconnected from this room. Try joining again.",
  };

  function rateLimitMessage(retryAfterSeconds) {
    const minutes = Math.max(1, Math.round((retryAfterSeconds || 0) / 60));
    return `Too many attempts — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  function errorMessageFor(errorType, retryAfterSeconds) {
    if (errorType === 'rate_limited') return rateLimitMessage(retryAfterSeconds);
    return ERROR_MESSAGES[errorType] || ERROR_MESSAGES.connectivity;
  }

  function renderWatchTogether({
    watchTogetherRoomCode,
    watchTogetherStatus,
    watchTogetherErrorType,
    watchTogetherRetryAfterSeconds,
    watchTogetherPendingDeepLink,
  }) {
    const status = watchTogetherStatus || 'idle';

    // Deep-link conflict banner — surfaced regardless of kill-switch state,
    // since dismissing/confirming should always be available.
    if (watchTogetherPendingDeepLink && watchTogetherPendingDeepLink.roomCode) {
      wtDeepLinkText.textContent = `You're in room ${watchTogetherPendingDeepLink.fromRoomCode} — join room ${watchTogetherPendingDeepLink.roomCode} instead?`;
      wtDeepLinkBanner.hidden = false;
    } else {
      wtDeepLinkBanner.hidden = true;
    }

    if (watchTogetherDisabled) {
      wtDisabledBox.hidden = false;
      wtErrorBox.hidden = true;
      wtIdle.hidden = true;
      wtActive.hidden = true;
      return;
    }
    wtDisabledBox.hidden = true;

    if (status === 'error') {
      wtErrorBox.textContent = errorMessageFor(watchTogetherErrorType, watchTogetherRetryAfterSeconds);
      wtErrorBox.hidden = false;
    } else {
      wtErrorBox.hidden = true;
    }

    const inRoom = ['creating', 'joining', 'waiting', 'connected', 'partner-left'].includes(status);
    wtIdle.hidden = inRoom;
    wtActive.hidden = !inRoom;

    if (!inRoom) {
      wtCreateBtn.disabled = false;
      wtCreateBtn.textContent = 'Create Room';
      wtJoinBtn.disabled = !isValidRoomCode(wtJoinInput.value.trim().toUpperCase());
      wtJoinBtn.textContent = 'Join';
      return;
    }

    wtCodeText.textContent = watchTogetherRoomCode || '';

    if (status === 'creating') {
      wtStatusText.textContent = 'Creating room…';
      wtStatusDot.className = 'wt-dot waiting';
      wtRegenerateBtn.hidden = true;
    } else if (status === 'joining') {
      wtStatusText.textContent = 'Joining room…';
      wtStatusDot.className = 'wt-dot waiting';
      wtRegenerateBtn.hidden = true;
    } else if (status === 'waiting') {
      wtStatusText.textContent = 'Waiting for someone to join…';
      wtStatusDot.className = 'wt-dot waiting';
      wtRegenerateBtn.hidden = false;
    } else if (status === 'connected') {
      wtStatusText.textContent = 'Connected — watching together';
      wtStatusDot.className = 'wt-dot connected';
      wtRegenerateBtn.hidden = true;
    } else if (status === 'partner-left') {
      wtStatusText.textContent = 'Partner left — waiting again';
      wtStatusDot.className = 'wt-dot waiting';
      wtRegenerateBtn.hidden = false;
    }
  }

  function loadWatchTogetherState() {
    chrome.storage.local.get(
      {
        watchTogetherRoomCode: null,
        watchTogetherStatus: 'idle',
        watchTogetherErrorType: null,
        watchTogetherRetryAfterSeconds: null,
        watchTogetherPendingDeepLink: null,
      },
      renderWatchTogether
    );
  }

  loadWatchTogetherState();

  // Kill switch: ask the Worker once per popup open whether Watch Together
  // is disabled. The section itself always stays visible either way.
  fetch(`${WORKER_BASE_URL}/watch-together/status`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      watchTogetherDisabled = Boolean(data && data.disabled);
      loadWatchTogetherState();
    })
    .catch(() => {
      // Can't reach the Worker to check — don't block the UI on it; normal
      // create/join attempts will surface their own connectivity errors.
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRoomCode') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherStatus') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherErrorType') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRetryAfterSeconds') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherPendingDeepLink')
    ) {
      loadWatchTogetherState();
    }
  });

  wtJoinInput.addEventListener('input', () => {
    wtJoinBtn.disabled = !isValidRoomCode(wtJoinInput.value.trim().toUpperCase());
  });

  wtCreateBtn.addEventListener('click', () => {
    wtCreateBtn.disabled = true;
    wtCreateBtn.textContent = 'Creating…';
    chrome.storage.local.set({
      watchTogetherRoomCode: null,
      watchTogetherIntent: 'create',
      watchTogetherStatus: 'creating',
      watchTogetherErrorType: null,
      watchTogetherRequestNonce: Date.now(),
    });
  });

  wtJoinBtn.addEventListener('click', () => {
    const code = wtJoinInput.value.trim().toUpperCase();
    if (!isValidRoomCode(code)) return;
    wtJoinBtn.disabled = true;
    wtJoinBtn.textContent = 'Joining…';
    chrome.storage.local.set({
      watchTogetherRoomCode: code,
      watchTogetherIntent: 'join',
      watchTogetherStatus: 'joining',
      watchTogetherErrorType: null,
      watchTogetherRequestNonce: Date.now(),
    });
  });

  wtLeaveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      watchTogetherRoomCode: null,
      watchTogetherIntent: null,
      watchTogetherStatus: 'idle',
      watchTogetherErrorType: null,
    });
  });

  wtRegenerateBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      watchTogetherRoomCode: null,
      watchTogetherIntent: 'create',
      watchTogetherStatus: 'creating',
      watchTogetherErrorType: null,
      watchTogetherRequestNonce: Date.now(),
    });
  });

  wtCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(wtCodeText.textContent).then(() => {
      const original = wtCopyBtn.textContent;
      wtCopyBtn.textContent = 'Copied!';
      setTimeout(() => {
        wtCopyBtn.textContent = original;
      }, 2000);
    });
  });

  wtShareBtn.addEventListener('click', () => {
    const roomCode = wtCodeText.textContent;
    if (!roomCode) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      let videoId = null;
      if (tab && tab.url) {
        try {
          videoId = new URL(tab.url).searchParams.get('v');
        } catch (err) {
          videoId = null;
        }
      }
      if (!isValidVideoId(videoId)) return;
      const link = `https://www.youtube.com/watch?v=${videoId}&wtRoom=${roomCode}`;
      navigator.clipboard.writeText(link).then(() => {
        const original = wtShareBtn.textContent;
        wtShareBtn.textContent = 'Link copied!';
        setTimeout(() => {
          wtShareBtn.textContent = original;
        }, 2000);
      });
    });
  });

  wtDeepLinkConfirmBtn.addEventListener('click', () => {
    chrome.storage.local.get({ watchTogetherPendingDeepLink: null }, (result) => {
      const pending = result.watchTogetherPendingDeepLink;
      if (!pending || !pending.roomCode) return;
      chrome.storage.local.set({
        watchTogetherRoomCode: pending.roomCode,
        watchTogetherIntent: 'join',
        watchTogetherStatus: 'joining',
        watchTogetherErrorType: null,
        watchTogetherRequestNonce: Date.now(),
        watchTogetherPendingDeepLink: null,
      });
    });
  });

  wtDeepLinkDismissBtn.addEventListener('click', () => {
    chrome.storage.local.set({ watchTogetherPendingDeepLink: null });
  });
});
