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
});
