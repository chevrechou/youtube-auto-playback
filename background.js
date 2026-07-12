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
