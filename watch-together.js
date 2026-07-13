(function () {
  const HEARTBEAT_INTERVAL_MS = 20000;
  const PARTICIPANT_TIMEOUT_MS = 60000;

  let clientId = null;
  let roomCode = null;
  let eventSource = null;
  let heartbeatId = null;
  let roomState = { state: null, participants: {} };

  function randomClientId() {
    return `client-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  function dbUrl(path) {
    return `${FIREBASE_DATABASE_URL}/${path}.json`;
  }

  function setStatus(status, errorType) {
    chrome.storage.local.set({
      watchTogetherStatus: status,
      watchTogetherErrorType: errorType || null,
    });
  }

  function getVideoId() {
    const params = new URLSearchParams(location.search);
    return location.pathname === '/watch' ? params.get('v') : null;
  }

  function applyRemoteState(state) {
    if (!state || !shouldApplyUpdate(state, clientId)) return;
    const video = document.querySelector('video');
    const currentVideoId = getVideoId();
    if (state.videoId && state.videoId !== currentVideoId) {
      location.href = `https://www.youtube.com/watch?v=${state.videoId}`;
      return;
    }
    if (!video) return;
    if (typeof state.currentTime === 'number' && Math.abs(video.currentTime - state.currentTime) > 1.5) {
      video.currentTime = state.currentTime;
    }
    if (state.isPaused && !video.paused) {
      video.pause();
    } else if (!state.isPaused && video.paused) {
      video.play().catch(() => {});
    }
  }

  function refreshParticipantDerivedStatus() {
    if (!roomCode) return;
    const now = Date.now();
    const others = Object.entries(roomState.participants || {}).filter(
      ([id, lastSeen]) => id !== clientId && !isParticipantStale(lastSeen, now, PARTICIPANT_TIMEOUT_MS)
    );
    if (others.length > 0) {
      setStatus('connected');
    } else {
      setStatus('partner-left');
    }
  }

  function handleStreamEvent(path, data) {
    if (path === '/' || path === '') {
      roomState = data || { state: null, participants: {} };
    } else {
      const segments = path.split('/').filter(Boolean);
      let target = roomState;
      for (let i = 0; i < segments.length - 1; i++) {
        target[segments[i]] = target[segments[i]] || {};
        target = target[segments[i]];
      }
      if (segments.length > 0) {
        if (data === null) {
          delete target[segments[segments.length - 1]];
        } else {
          target[segments[segments.length - 1]] = data;
        }
      }
    }
    if (roomState.state) {
      applyRemoteState(roomState.state);
    }
    refreshParticipantDerivedStatus();
  }

  function connectStream() {
    if (eventSource) {
      eventSource.close();
    }
    eventSource = new EventSource(dbUrl(`rooms/${roomCode}`));
    eventSource.addEventListener('put', (e) => {
      const { path, data } = JSON.parse(e.data);
      handleStreamEvent(path, data);
    });
    eventSource.addEventListener('patch', (e) => {
      const { path, data } = JSON.parse(e.data);
      handleStreamEvent(path, data);
    });
    eventSource.onerror = () => {
      setStatus('error', 'connectivity');
    };
  }

  function startHeartbeat() {
    stopHeartbeat();
    const beat = () => {
      fetch(dbUrl(`rooms/${roomCode}/participants/${clientId}`), {
        method: 'PUT',
        body: JSON.stringify({ '.sv': 'timestamp' }),
      }).catch(() => setStatus('error', 'connectivity'));
    };
    beat();
    heartbeatId = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
  }

  async function createRoom(code) {
    if (!isFirebaseConfigured(FIREBASE_DATABASE_URL)) {
      setStatus('error', 'not-configured');
      return;
    }
    clientId = randomClientId();
    roomCode = code;
    setStatus('creating');
    try {
      await fetch(dbUrl(`rooms/${code}`), {
        method: 'PUT',
        body: JSON.stringify({
          state: {
            videoId: getVideoId(),
            currentTime: 0,
            isPaused: true,
            updatedAt: { '.sv': 'timestamp' },
            updatedBy: clientId,
          },
          participants: { [clientId]: { '.sv': 'timestamp' } },
        }),
      });
      connectStream();
      startHeartbeat();
      setStatus('waiting');
    } catch (err) {
      setStatus('error', 'connectivity');
    }
  }

  async function joinRoom(code) {
    if (!isFirebaseConfigured(FIREBASE_DATABASE_URL)) {
      setStatus('error', 'not-configured');
      return;
    }
    clientId = randomClientId();
    roomCode = code;
    setStatus('joining');
    try {
      const res = await fetch(dbUrl(`rooms/${code}`));
      const existing = await res.json();
      if (!existing) {
        setStatus('error', 'not-found');
        return;
      }
      if (isRoomFull(existing.participants || {}, clientId, Date.now(), PARTICIPANT_TIMEOUT_MS)) {
        setStatus('error', 'full');
        return;
      }
      roomState = existing;
      await fetch(dbUrl(`rooms/${code}/participants/${clientId}`), {
        method: 'PUT',
        body: JSON.stringify({ '.sv': 'timestamp' }),
      });
      connectStream();
      startHeartbeat();
      refreshParticipantDerivedStatus();
      if (existing.state) {
        applyRemoteState(existing.state);
      }
    } catch (err) {
      setStatus('error', 'connectivity');
    }
  }

  function leaveRoom() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    stopHeartbeat();
    if (roomCode && clientId) {
      fetch(dbUrl(`rooms/${roomCode}/participants/${clientId}`), { method: 'DELETE' }).catch(() => {});
    }
    roomCode = null;
    clientId = null;
    roomState = { state: null, participants: {} };
    setStatus('idle');
  }

  function writeLocalPlaybackState(video) {
    if (!roomCode || !clientId) return;
    fetch(dbUrl(`rooms/${roomCode}/state`), {
      method: 'PUT',
      body: JSON.stringify({
        videoId: getVideoId(),
        currentTime: video.currentTime,
        isPaused: video.paused,
        updatedAt: { '.sv': 'timestamp' },
        updatedBy: clientId,
      }),
    }).catch(() => setStatus('error', 'connectivity'));
  }

  function attachVideoListeners() {
    const video = document.querySelector('video');
    if (!video || video.dataset.watchTogetherBound) return;
    video.dataset.watchTogetherBound = 'true';
    ['play', 'pause', 'seeked'].forEach((evt) => {
      video.addEventListener(evt, () => writeLocalPlaybackState(video));
    });
  }

  setInterval(attachVideoListeners, 1000);

  chrome.storage.local.get({ watchTogetherRoomCode: null, watchTogetherIntent: null }, (result) => {
    if (result.watchTogetherRoomCode && result.watchTogetherIntent === 'create') {
      createRoom(result.watchTogetherRoomCode);
    } else if (result.watchTogetherRoomCode && result.watchTogetherIntent === 'join') {
      joinRoom(result.watchTogetherRoomCode);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRoomCode')) return;
    const newCode = changes.watchTogetherRoomCode.newValue;
    if (!newCode) {
      leaveRoom();
      return;
    }
    if (newCode === roomCode) return;
    chrome.storage.local.get({ watchTogetherIntent: null }, (result) => {
      if (result.watchTogetherIntent === 'create') {
        createRoom(newCode);
      } else if (result.watchTogetherIntent === 'join') {
        joinRoom(newCode);
      }
    });
  });
})();
