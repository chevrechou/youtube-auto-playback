function isVideoResumable(video) {
  return Boolean(video) && video.paused === true && video.ended === false;
}

function findResumeButton(root) {
  const nodes = root.querySelectorAll('button, .ytp-play-button');
  for (const el of nodes) {
    const ariaLabel = (el.getAttribute && el.getAttribute('aria-label')) || '';
    const text = el.textContent || '';
    const label = (ariaLabel || text).trim().toLowerCase();
    const isResumeLabel = label === 'play' || label === 'resume' || label.includes('yes');
    const isVisible = el.offsetParent !== null && el.offsetParent !== undefined;
    if (isResumeLabel && isVisible) {
      return el;
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { isVideoResumable, findResumeButton };
}
