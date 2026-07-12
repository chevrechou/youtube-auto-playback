(function () {
  const CHECK_INTERVAL_MS = 1000;
  let enabled = true;
  let intervalId = null;

  function tick() {
    if (!enabled) return;
    const video = document.querySelector('video');
    if (video && !video.loop) {
      video.loop = true;
    }
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
