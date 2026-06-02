/**
 * gemini-cs.js — Content script for Gemini (gemini.google.com)
 *
 * Responsibilities:
 *  1. Detect UI readiness / auth-required → notify background SW
 *  2. Auto-scroll + hydrate conversation DOM before extraction
 *  3. Extract full conversation on EXTRACT_CONVERSATION request
 */

if (!window.__CW_GEMINI_CS__) {
  window.__CW_GEMINI_CS__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // ── Auto-scroll hydration ────────────────────────────────────────────────
  /**
   * Gemini uses Angular-based lazy rendering. Scrolling forces it to render
   * all conversation turns. Some older turns may only appear after scrolling up.
   */
  async function hydrateConversation(timeoutMs = 7000) {
    const deadline = Date.now() + timeoutMs;

    const scroller =
      document.querySelector('[class*="conversation-container"]') ||
      document.querySelector('infinite-scroller') ||
      document.querySelector('main') ||
      document.documentElement;

    const countTurns = () =>
      document.querySelectorAll('user-query, model-response, [data-chunk-index]').length;

    let prev = countTurns();

    while (Date.now() < deadline) {
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      await sleep(500);

      const curr = countTurns();
      if (curr === prev) break;
      prev = curr;
    }

    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    await sleep(200);
  }

  // ── Extraction helpers ───────────────────────────────────────────────────
  function extractTitle() {
    const t = document.title.replace(/\s*[-|]\s*Gemini\s*$/i, '').trim();
    return (t && t !== 'Gemini') ? t : 'Gemini Conversation';
  }

  function extractModel() {
    const btn =
      document.querySelector('[data-testid="model-name"]') ||
      document.querySelector('bard-mode-switcher');
    return btn ? btn.textContent.trim() : null;
  }

  function extractMessages() {
    // Strategy 1: Gemini custom elements
    const elements = Array.from(
      document.querySelectorAll('user-query, model-response')
    );
    if (elements.length > 0) {
      return elements.map((el, i) => ({
        role: el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant',
        content: (
          el.querySelector('.query-text') ||
          el.querySelector('.model-response-text') ||
          el.querySelector('[class*="responseText"]') ||
          el
        ).innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 2: class-based containers
    const mixed = Array.from(document.querySelectorAll(
      '[class*="user-query"], [class*="model-response"], .query-content, .response-container'
    ));
    if (mixed.length > 0) {
      return mixed.map((el, i) => ({
        role: (el.className || '').match(/user|query/i) ? 'user' : 'assistant',
        content: el.innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 3: data-chunk-index
    const chunks = Array.from(document.querySelectorAll('[data-chunk-index]'));
    if (chunks.length > 0) {
      return chunks.map((el, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: el.innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    return null;
  }

  // ── Message listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'EXTRACT_CONVERSATION') return;

    hydrateConversation().then(() => {
      try {
        const messages = extractMessages();
        if (!messages || messages.length === 0) {
          sendResponse({ ok: false, error: 'NO_MESSAGES', detail: 'No conversation found.' });
          return;
        }
        sendResponse({
          ok: true,
          payload: {
            title:    extractTitle(),
            messages: messages.slice(0, 500),
            metadata: {
              model:           extractModel(),
              messageCount:    messages.length,
              charCount:       messages.reduce((n, m) => n + m.content.length, 0),
              extractorVersion:'1.1.0',
            },
          },
        });
      } catch (err) {
        sendResponse({ ok: false, error: 'EXTRACTION_FAILED', detail: String(err) });
      }
    }).catch(err => {
      sendResponse({ ok: false, error: 'EXTRACTION_FAILED', detail: String(err) });
    });

    return true;
  });
}
