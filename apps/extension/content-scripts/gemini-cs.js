/**
 * gemini-cs.js — Content script for Gemini (gemini.google.com)
 *
 * Detects UI readiness / sign-in required and tells the background service
 * worker (CS_UI_READY / CS_AUTH_REQUIRED). Capturing a conversation doesn't
 * go through this script: the background worker reads the page itself.
 */

if (!window.__CW_GEMINI_CS__) {
  window.__CW_GEMINI_CS__ = true;

  // ── UI / auth detection ──────────────────────────────────────────────────
  let _poll = setInterval(() => {
    if (document.querySelector('a[href*="accounts.google.com"]') ||
        document.querySelector('[data-authuser]')) {
      chrome.runtime.sendMessage({ type: 'CS_AUTH_REQUIRED' });
      return;
    }
    if (document.querySelector('rich-textarea') ||
        document.querySelector('.ql-editor') ||
        document.querySelector('[contenteditable="true"][role="textbox"]')) {
      clearInterval(_poll);
      chrome.runtime.sendMessage({ type: 'CS_UI_READY' });
    }
  }, 1500);
}
