/**
 * ChatGPT content script — polls for UI readiness, reports to background SW.
 * Runs at document_idle in every ChatGPT tab.
 */
(() => {
  const POLL_MS   = 1_500;
  const AUTH_SEL  = 'button[data-testid="login-button"], a[href*="/auth/login"]';
  const UI_SEL    = 'div#prompt-textarea[contenteditable], textarea#prompt-textarea';

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

  // Poll until resolved
  const id = setInterval(() => {
    check();
    if (reported) clearInterval(id);
  }, POLL_MS);

  // Also check immediately
  check();
})();
