(function () {
  const CHECK_INTERVAL_MS = 1000;
  const ZEN_CLASS = 'yt-auto-playback-zen';
  let enabled = true;
  let zenModeEnabled = false;
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

  function injectZenModeStyle() {
    if (document.getElementById('yt-auto-playback-zen-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-auto-playback-zen-style';
    style.textContent = buildZenModeCSS(ZEN_CLASS);
    document.documentElement.appendChild(style);
  }

  function applyZenModeState(value) {
    zenModeEnabled = value;
    const onWatchPage = location.pathname === '/watch';
    document.documentElement.classList.toggle(ZEN_CLASS, zenModeEnabled && onWatchPage);
  }

  injectZenModeStyle();

  chrome.storage.sync.get({ enabled: true, zenModeEnabled: false }, (result) => {
    applyEnabledState(result.enabled);
    applyZenModeState(result.zenModeEnabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
      applyEnabledState(changes.enabled.newValue);
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'zenModeEnabled')) {
      applyZenModeState(changes.zenModeEnabled.newValue);
    }
  });

  document.addEventListener('yt-navigate-finish', () => {
    tick();
    applyZenModeState(zenModeEnabled);
  });
})();
