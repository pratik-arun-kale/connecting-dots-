/**
 * chatgpt-capture.js — Content script for chat.openai.com
 * =========================================================
 * Injects a floating "Capture Context" button into the ChatGPT UI.
 * On click:
 *   1. Requests the session mapping from the background service worker
 *   2. Extracts conversation messages from the DOM
 *   3. POSTs raw JSON to the backend /api/v1/contexts/capture endpoint
 *
 * Capture is MANUAL ONLY — no automatic or continuous scraping.
 */

(function () {
  'use strict';

  const BACKEND_URL = 'http://localhost:8000';
  const BUTTON_ID = 'ai-context-capture-btn';

  // Only inject once per page load
  if (document.getElementById(BUTTON_ID)) return;

  // ─── Floating button ────────────────────────────────────────────────────────

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.textContent = 'Save to Project';
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647',
    background: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(79, 70, 229, 0.45)',
    transition: 'background 0.15s, transform 0.15s, opacity 0.15s',
    lineHeight: '1',
  });

  button.addEventListener('mouseenter', () => {
    button.style.background = '#4338ca';
    button.style.transform = 'translateY(-1px)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = '#4f46e5';
    button.style.transform = 'translateY(0)';
  });

  document.body.appendChild(button);

  // ─── Conversation extraction ─────────────────────────────────────────────────

  /**
   * Extract messages from the ChatGPT DOM.
   * Tries the most stable selectors first, falls back to role-based containers.
   * @returns {{ role: string, content: string }[]}
   */
  function extractMessages() {
    const messages = [];

    // Primary: data-message-author-role attribute (stable across ChatGPT redesigns)
    const roleEls = document.querySelectorAll('[data-message-author-role]');
    if (roleEls.length > 0) {
      roleEls.forEach((el) => {
        const role = el.getAttribute('data-message-author-role') || 'unknown';
        // Prefer the prose/markdown container; fall back to the full element text
        const contentEl =
          el.querySelector('.markdown') ||
          el.querySelector('[class*="prose"]') ||
          el.querySelector('[class*="message-content"]') ||
          el;
        const content = (contentEl.innerText || '').trim();
        if (content) {
          messages.push({ role, content });
        }
      });
      return messages;
    }

    // Fallback: look for alternating user/assistant article elements
    const articles = document.querySelectorAll('article[data-testid]');
    articles.forEach((article) => {
      const testId = article.getAttribute('data-testid') || '';
      const role = testId.includes('user') ? 'user' : 'assistant';
      const content = (article.innerText || '').trim();
      if (content) {
        messages.push({ role, content });
      }
    });

    return messages;
  }

  // ─── Capture handler ─────────────────────────────────────────────────────────

  function setButtonState(state) {
    const STATES = {
      idle:      { text: 'Save to Project', bg: '#4f46e5', disabled: false },
      loading:   { text: 'Saving…',         bg: '#6366f1', disabled: true  },
      success:   { text: 'Saved!',           bg: '#059669', disabled: true  },
      noSession: { text: 'No Session',       bg: '#d97706', disabled: true  },
      error:     { text: 'Failed!',          bg: '#dc2626', disabled: true  },
    };
    const s = STATES[state] || STATES.idle;
    button.textContent = s.text;
    button.style.background = s.bg;
    button.disabled = s.disabled;
  }

  function resetAfter(ms) {
    setTimeout(() => setButtonState('idle'), ms);
  }

  button.addEventListener('click', async () => {
    setButtonState('loading');

    try {
      // 1. Request the session mapping for this tab from the background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'GET_TAB_MAPPING' }, resolve);
      });

      if (!response || !response.mapping) {
        console.warn('[PageCapture] No session mapping for this tab.');
        setButtonState('noSession');
        resetAfter(3000);
        return;
      }

      const { sessionId, platform } = response.mapping;

      // 2. Extract conversation messages
      const messages = extractMessages();
      if (messages.length === 0) {
        alert('[PageCapture] No conversation found on this page yet. Have a conversation first!');
        setButtonState('idle');
        return;
      }

      // 3. POST raw capture to backend
      const payload = {
        session_id: sessionId,
        platform: platform,
        url: window.location.href,
        raw_content: { messages },
      };

      const res = await fetch(`${BACKEND_URL}/api/v1/contexts/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Backend ${res.status}: ${body}`);
      }

      console.log('[PageCapture] Context captured —', messages.length, 'messages sent.');

      // Notify background to record this capture in the workspace state
      chrome.runtime.sendMessage({
        action: 'RECORD_CAPTURE',
        data: { sessionId, platform, url: window.location.href, messageCount: messages.length },
      });

      setButtonState('success');
      resetAfter(2500);

    } catch (err) {
      console.error('[PageCapture] Capture failed:', err);
      setButtonState('error');
      resetAfter(2500);
    }
  });
})();
