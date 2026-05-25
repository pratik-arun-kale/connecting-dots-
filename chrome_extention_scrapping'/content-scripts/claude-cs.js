/**
 * Claude content script — polls for UI readiness, reports to background SW.
 */
(() => {
  const POLL_MS  = 1_500;
  const AUTH_SEL = 'button[data-testid="login-button"], a[href*="/login"]';
  const UI_SEL   = '.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]';

  let reported = false;

  function check() {
    if (reported) return;

    if (document.querySelector(AUTH_SEL)) {
      reported = true;
      chrome.runtime.sendMessage({ type: 'CS_AUTH_REQUIRED' });
      return;
    }

    if (document.querySelector(UI_SEL)) {
      reported = true;
      chrome.runtime.sendMessage({ type: 'CS_UI_READY' });
    }
  }

  const id = setInterval(() => {
    check();
    if (reported) clearInterval(id);
  }, POLL_MS);

  check();
})();
