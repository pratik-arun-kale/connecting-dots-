/**
 * chatgpt-cs.js — Content script for ChatGPT (chatgpt.com, chat.openai.com)
 *
 * Detects UI readiness / sign-in required and tells the background service
 * worker (CS_UI_READY / CS_AUTH_REQUIRED). Capturing a conversation doesn't
 * go through this script: the background worker reads the page itself.
 */

if (!window.__CW_CHATGPT_CS__) {
  window.__CW_CHATGPT_CS__ = true;

  // ── UI / auth detection ──────────────────────────────────────────────────
  let _poll = setInterval(() => {
    if (document.querySelector('[data-testid="login-button"]') ||
        document.querySelector('a[href*="/auth/login"]')) {
      chrome.runtime.sendMessage({ type: 'CS_AUTH_REQUIRED' });
      return;
    }
    if (document.querySelector('#prompt-textarea[contenteditable]') ||
        document.querySelector('textarea#prompt-textarea')) {
      clearInterval(_poll);
      chrome.runtime.sendMessage({ type: 'CS_UI_READY' });
    }
  }, 1500);
}
