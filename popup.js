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
  const wtIdle = document.getElementById('wt-idle');
  const wtActive = document.getElementById('wt-active');
  const wtCreateBtn = document.getElementById('wt-create-btn');
  const wtJoinInput = document.getElementById('wt-join-input');
  const wtJoinBtn = document.getElementById('wt-join-btn');
  const wtCodeText = document.getElementById('wt-code-text');
  const wtCopyBtn = document.getElementById('wt-copy-btn');
  const wtStatusDot = document.getElementById('wt-status-dot');
  const wtStatusText = document.getElementById('wt-status-text');
  const wtRegenerateBtn = document.getElementById('wt-regenerate-btn');
  const wtLeaveBtn = document.getElementById('wt-leave-btn');

  const ERROR_MESSAGES = {
    connectivity: "Couldn't connect. Check your connection and try again.",
    'not-found': "Room not found. Check the code and try again.",
    full: 'Room is full.',
    'not-configured': "Watch Together needs a one-time setup — see README.md's Firebase setup section.",
  };

  function renderWatchTogether({ watchTogetherRoomCode, watchTogetherStatus, watchTogetherErrorType }) {
    const status = watchTogetherStatus || 'idle';

    if (status === 'error') {
      wtErrorBox.textContent = ERROR_MESSAGES[watchTogetherErrorType] || ERROR_MESSAGES.connectivity;
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
      { watchTogetherRoomCode: null, watchTogetherStatus: 'idle', watchTogetherErrorType: null },
      renderWatchTogether
    );
  }

  loadWatchTogetherState();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRoomCode') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherStatus') ||
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherErrorType')
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
    const code = generateRoomCode();
    chrome.storage.local.set({
      watchTogetherRoomCode: code,
      watchTogetherIntent: 'create',
      watchTogetherStatus: 'creating',
      watchTogetherErrorType: null,
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
    const code = generateRoomCode();
    chrome.storage.local.set({
      watchTogetherRoomCode: code,
      watchTogetherIntent: 'create',
      watchTogetherStatus: 'creating',
      watchTogetherErrorType: null,
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
});
