/**
 * claude-cs.js — Content script for Claude (claude.ai)
 *
 * Detects UI readiness / sign-in required and tells the background service
 * worker (CS_UI_READY / CS_AUTH_REQUIRED). Capturing a conversation doesn't
 * go through this script: the background worker reads the page itself.
 */

if (!window.__CW_CLAUDE_CS__) {
  window.__CW_CLAUDE_CS__ = true;

  // ── UI / auth detection ──────────────────────────────────────────────────
  let _poll = setInterval(() => {
    if (document.querySelector('a[href*="/login"]') ||
        document.querySelector('button[data-testid*="login"]')) {
      chrome.runtime.sendMessage({ type: 'CS_AUTH_REQUIRED' });
      return;
    }
    if (document.querySelector('.ProseMirror[contenteditable="true"]') ||
        document.querySelector('[contenteditable="true"][role="textbox"]')) {
      clearInterval(_poll);
      chrome.runtime.sendMessage({ type: 'CS_UI_READY' });
    }
  }, 1500);
}
