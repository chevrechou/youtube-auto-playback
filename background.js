const DEFAULT_ENABLED = true;
const DEFAULT_ZEN_MODE_ENABLED = false;

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#2e7d32' : '#757575' });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    { enabled: DEFAULT_ENABLED, zenModeEnabled: DEFAULT_ZEN_MODE_ENABLED },
    (result) => {
      chrome.storage.sync.set({
        enabled: result.enabled,
        zenModeEnabled: result.zenModeEnabled,
      });
      setBadge(result.enabled);
    }
  );
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
    setBadge(changes.enabled.newValue);
  }
});

chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
  setBadge(result.enabled);
});
