function buildZenModeCSS(className) {
  const selectors = [
    '#comments',
    '#related',
    'ytd-watch-next-secondary-results-renderer',
    '.ytp-endscreen-content',
    'ytd-reel-shelf-renderer',
  ];
  const rule = selectors.map((selector) => `.${className} ${selector}`).join(', ');
  return `${rule} { display: none !important; }`;
}

if (typeof module !== 'undefined') {
  module.exports = { buildZenModeCSS };
}
