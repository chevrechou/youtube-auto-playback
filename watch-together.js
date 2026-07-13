(function () {
  const HEARTBEAT_INTERVAL_MS = 20000;
  const PARTICIPANT_TIMEOUT_MS = 60000;
  const TOKEN_REFRESH_BUFFER_SECONDS = 600; // refresh ~10 min before expiry (~50 min for a 60 min token)
  const TOKEN_RETRY_SECONDS = 15; // backoff when a refresh attempt itself fails transiently

  let clientId = null;
  let roomCode = null;
  let idToken = null;
  let eventSource = null;
  let heartbeatId = null;
  let refreshTimerId = null;
  let refreshInFlight = null;
  let roomState = { state: null, participants: {} };

  function randomClientId() {
    return `client-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  function authedDbUrl(path) {
    return `${FIREBASE_DATABASE_URL}/${path}.json?auth=${idToken}`;
  }

  function setStatus(status, errorType, extra) {
    chrome.storage.local.set({
      watchTogetherStatus: status,
      watchTogetherErrorType: errorType || null,
      watchTogetherRetryAfterSeconds: (extra && extra.retryAfterSeconds) || null,
    });
  }

  function getVideoId() {
    const params = new URLSearchParams(location.search);
    return location.pathname === '/watch' ? params.get('v') : null;
  }

  // --- Worker HTTP calls (create/join/refresh/status — rate-limited, validated) ---

  async function workerPost(path, body) {
    const res = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  function setErrorFromWorkerResponse(status, data) {
    if (status === 429) {
      setStatus('error', 'rate_limited', { retryAfterSeconds: data && data.retryAfterSeconds });
    } else {
      setStatus('error', (data && data.error) || 'connectivity');
    }
  }

  // --- Firebase Auth REST: exchange a Worker-minted custom token for an ID token ---

  async function exchangeCustomToken(customToken) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );
    if (!res.ok) {
      throw new Error('auth-exchange-failed');
    }
    return res.json();
  }

  async function beginAuthedSession(customToken) {
    try {
      const result = await exchangeCustomToken(customToken);
      idToken = result.idToken;
      scheduleProactiveRefresh(Number(result.expiresIn) || 3600);
      return true;
    } catch (err) {
      setStatus('error', 'connectivity');
      return false;
    }
  }

  function scheduleProactiveRefresh(expiresInSeconds) {
    if (refreshTimerId !== null) {
      clearTimeout(refreshTimerId);
    }
    const delayMs = Math.max(0, (expiresInSeconds - TOKEN_REFRESH_BUFFER_SECONDS) * 1000);
    refreshTimerId = setTimeout(() => performTokenRefresh('scheduled'), delayMs);
  }

  function scheduleRetry(delaySeconds) {
    if (refreshTimerId !== null) {
      clearTimeout(refreshTimerId);
    }
    refreshTimerId = setTimeout(() => performTokenRefresh('retry'), delaySeconds * 1000);
  }

  // Both the proactive (scheduled) refresh and the reactive (401-triggered)
  // refresh funnel through here, sharing an in-flight promise so a burst of
  // 401s (e.g. heartbeat + state write + stream all failing at once after a
  // laptop wakes from sleep) only issues one Worker refresh call.
  function performTokenRefresh(reason) {
    if (!roomCode || !clientId) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      let result;
      try {
        result = await workerPost('/watch-together/refresh', { roomCode, clientId });
      } catch (err) {
        scheduleRetry(TOKEN_RETRY_SECONDS);
        return;
      }
      const { ok, status, data } = result;
      if (!ok) {
        if (status === 403) {
          endSessionWithError('not_a_participant');
        } else if (status === 503) {
          endSessionWithError('service_disabled');
        } else {
          scheduleRetry(TOKEN_RETRY_SECONDS);
        }
        return;
      }
      const authed = await beginAuthedSession(data.customToken);
      if (authed && roomCode) {
        connectStream();
      }
    })();

    return refreshInFlight.finally(() => {
      refreshInFlight = null;
    });
  }

  // --- Direct-to-Firebase real-time sync (authenticated) ---

  function applyRemoteState(state) {
    if (!state || !shouldApplyUpdate(state, clientId)) return;
    const video = document.querySelector('video');
    const currentVideoId = getVideoId();
    if (state.videoId && isValidVideoId(state.videoId) && state.videoId !== currentVideoId) {
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

  // Unchanged from the previous direct-Firebase implementation — same event
  // shape, same partial-tree patching, no reason to touch it.
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
    eventSource = new EventSource(authedDbUrl(`rooms/${roomCode}`));
    eventSource.addEventListener('put', (e) => {
      const { path, data } = JSON.parse(e.data);
      handleStreamEvent(path, data);
    });
    eventSource.addEventListener('patch', (e) => {
      const { path, data } = JSON.parse(e.data);
      handleStreamEvent(path, data);
    });
    eventSource.onerror = () => {
      // EventSource doesn't expose the HTTP status of a failed connection,
      // so probe with a plain fetch to tell an expired token (401 — trigger
      // the reactive refresh) apart from a generic connectivity blip.
      if (!roomCode || !idToken) return;
      fetch(authedDbUrl(`rooms/${roomCode}`))
        .then((res) => {
          if (res.status === 401) {
            performTokenRefresh('reactive-stream');
          } else if (!res.ok) {
            setStatus('error', 'connectivity');
          }
        })
        .catch(() => setStatus('error', 'connectivity'));
    };
  }

  function startHeartbeat() {
    stopHeartbeat();
    const beat = async () => {
      if (!roomCode || !clientId || !idToken) return;
      try {
        const res = await fetch(authedDbUrl(`rooms/${roomCode}/participants/${clientId}`), {
          method: 'PUT',
          body: JSON.stringify({ '.sv': 'timestamp' }),
        });
        if (res.status === 401) {
          performTokenRefresh('reactive-heartbeat');
        } else if (!res.ok) {
          setStatus('error', 'connectivity');
        }
      } catch (err) {
        setStatus('error', 'connectivity');
      }
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

  async function writeState(videoId) {
    if (!roomCode || !clientId || !idToken) return;
    try {
      const res = await fetch(authedDbUrl(`rooms/${roomCode}/state`), {
        method: 'PUT',
        body: JSON.stringify({
          videoId,
          currentTime: 0,
          isPaused: true,
          updatedAt: { '.sv': 'timestamp' },
          updatedBy: clientId,
        }),
      });
      if (res.status === 401) {
        performTokenRefresh('reactive-state');
      }
    } catch (err) {
      setStatus('error', 'connectivity');
    }
  }

  function writeLocalPlaybackState(video) {
    if (!roomCode || !clientId || !idToken) return;
    fetch(authedDbUrl(`rooms/${roomCode}/state`), {
      method: 'PUT',
      body: JSON.stringify({
        videoId: getVideoId(),
        currentTime: video.currentTime,
        isPaused: video.paused,
        updatedAt: { '.sv': 'timestamp' },
        updatedBy: clientId,
      }),
    })
      .then((res) => {
        if (res.status === 401) {
          performTokenRefresh('reactive-state');
        }
      })
      .catch(() => setStatus('error', 'connectivity'));
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

  // --- Session lifecycle: create / join / leave, via the Worker ---

  function teardownSession() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    stopHeartbeat();
    if (refreshTimerId !== null) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
    refreshInFlight = null;
    if (roomCode && clientId && idToken) {
      fetch(authedDbUrl(`rooms/${roomCode}/participants/${clientId}`), { method: 'DELETE' }).catch(() => {});
    }
    idToken = null;
  }

  async function createRoom(videoId) {
    if (!isFirebaseConfigured(FIREBASE_DATABASE_URL)) {
      setStatus('error', 'backend_unavailable');
      return;
    }
    if (!isValidVideoId(videoId)) {
      setStatus('error', 'invalid_video_id');
      return;
    }
    teardownSession();
    clientId = randomClientId();
    roomCode = null;
    setStatus('creating');

    let result;
    try {
      result = await workerPost('/watch-together/create', { videoId });
    } catch (err) {
      setStatus('error', 'connectivity');
      return;
    }
    if (!result.ok) {
      setErrorFromWorkerResponse(result.status, result.data);
      return;
    }

    roomCode = result.data.roomCode;
    chrome.storage.local.set({ watchTogetherRoomCode: roomCode });

    const authed = await beginAuthedSession(result.data.customToken);
    if (!authed) return;

    // Idempotent: the Worker may already have written this via its Admin
    // credentials when it created the room, but writing it again here is
    // harmless and guards against relying on an unspecified backend detail.
    await writeState(videoId);
    connectStream();
    startHeartbeat();
    setStatus('waiting');
  }

  async function joinRoom(code) {
    if (!isFirebaseConfigured(FIREBASE_DATABASE_URL)) {
      setStatus('error', 'backend_unavailable');
      return;
    }
    if (!isValidRoomCode(code)) {
      setStatus('error', 'invalid_room_code');
      return;
    }
    teardownSession();
    clientId = randomClientId();
    roomCode = code;
    setStatus('joining');

    let result;
    try {
      result = await workerPost('/watch-together/join', { roomCode: code });
    } catch (err) {
      setStatus('error', 'connectivity');
      roomCode = null;
      return;
    }
    if (!result.ok) {
      setErrorFromWorkerResponse(result.status, result.data);
      roomCode = null;
      return;
    }

    const authed = await beginAuthedSession(result.data.customToken);
    if (!authed) return;

    connectStream();
    startHeartbeat();

    const remoteVideoId = result.data.videoId;
    if (remoteVideoId && isValidVideoId(remoteVideoId) && remoteVideoId !== getVideoId()) {
      location.href = `https://www.youtube.com/watch?v=${remoteVideoId}&wtRoom=${roomCode}`;
      return;
    }
    refreshParticipantDerivedStatus();
  }

  function leaveRoom() {
    teardownSession();
    roomCode = null;
    clientId = null;
    roomState = { state: null, participants: {} };
    setStatus('idle');
  }

  // Like leaveRoom(), but leaves the just-set error status/type visible
  // instead of clobbering it with 'idle' — used when a refresh failure
  // (not_a_participant / service_disabled) forces the session closed.
  function endSessionWithError(errorType) {
    teardownSession();
    roomCode = null;
    clientId = null;
    roomState = { state: null, participants: {} };
    chrome.storage.local.set({
      watchTogetherRoomCode: null,
      watchTogetherStatus: 'error',
      watchTogetherErrorType: errorType,
      watchTogetherRetryAfterSeconds: null,
    });
  }

  // --- Deep links: https://www.youtube.com/watch?v=...&wtRoom=CODE ---

  function stripWtRoomParam() {
    const url = new URL(location.href);
    if (!url.searchParams.has('wtRoom')) return;
    url.searchParams.delete('wtRoom');
    history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  }

  function handleDeepLink() {
    const wtRoom = new URLSearchParams(location.search).get('wtRoom');
    if (!wtRoom || !isValidRoomCode(wtRoom)) return;

    chrome.storage.local.get({ watchTogetherRoomCode: null, watchTogetherStatus: 'idle' }, (result) => {
      const inRoom = ['creating', 'joining', 'waiting', 'connected', 'partner-left'].includes(
        result.watchTogetherStatus
      );

      if (inRoom && result.watchTogetherRoomCode === wtRoom) {
        stripWtRoomParam();
        return;
      }

      if (inRoom && result.watchTogetherRoomCode) {
        // Already in a *different* room — don't switch silently. Surface a
        // confirmation for the popup to render (this is a content script,
        // it has no UI of its own; see README's design-decisions note on
        // why a popup-rendered banner was chosen over an on-page overlay).
        chrome.storage.local.set({
          watchTogetherPendingDeepLink: { roomCode: wtRoom, fromRoomCode: result.watchTogetherRoomCode },
        });
        stripWtRoomParam();
        return;
      }

      // Not currently in any room — join directly.
      chrome.storage.local.set({
        watchTogetherRoomCode: wtRoom,
        watchTogetherIntent: 'join',
        watchTogetherStatus: 'joining',
        watchTogetherErrorType: null,
        watchTogetherRequestNonce: Date.now(),
      });
      stripWtRoomParam();
    });
  }

  // --- chrome.storage-driven dispatch (popup writes intent, this script acts) ---

  chrome.storage.local.get(
    { watchTogetherIntent: null, watchTogetherRoomCode: null },
    (result) => {
      if (result.watchTogetherIntent === 'create') {
        createRoom(getVideoId());
      } else if (result.watchTogetherIntent === 'join' && result.watchTogetherRoomCode) {
        joinRoom(result.watchTogetherRoomCode);
      }
      handleDeepLink();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    // A brand-new user action from the popup (Create / Join / Regenerate).
    // Keyed off a nonce rather than watchTogetherRoomCode because, for
    // "create", the room code doesn't exist yet — it comes back from the
    // Worker — so there's nothing for the popup to write ahead of time.
    if (Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRequestNonce')) {
      chrome.storage.local.get({ watchTogetherIntent: null, watchTogetherRoomCode: null }, (result) => {
        if (result.watchTogetherIntent === 'create') {
          createRoom(getVideoId());
        } else if (result.watchTogetherIntent === 'join' && result.watchTogetherRoomCode) {
          joinRoom(result.watchTogetherRoomCode);
        }
      });
    }

    // Leaving the room (popup's "Leave Room" button clears the code). Not
    // triggered when the code was cleared as part of endSessionWithError()
    // (status ends up 'error' in that same write) — that path already did
    // its own teardown and calling leaveRoom() here would immediately
    // clobber the error status back to 'idle' before the user ever saw it.
    const clearedToError =
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherStatus') &&
      changes.watchTogetherStatus.newValue === 'error';
    if (
      Object.prototype.hasOwnProperty.call(changes, 'watchTogetherRoomCode') &&
      changes.watchTogetherRoomCode.newValue === null &&
      !clearedToError
    ) {
      leaveRoom();
    }
  });
})();
