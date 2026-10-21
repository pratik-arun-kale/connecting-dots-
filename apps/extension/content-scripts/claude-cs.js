/**
 * claude-cs.js — Content script for Claude (claude.ai)
 *
 * Responsibilities:
 *  1. Detect UI readiness / auth-required → notify background SW
 *  2. Auto-scroll + hydrate conversation DOM before extraction
 *  3. Extract full conversation on EXTRACT_CONVERSATION request
 */

if (!window.__CW_CLAUDE_CS__) {
  window.__CW_CLAUDE_CS__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // ── Auto-scroll hydration ────────────────────────────────────────────────
  /**
   * Claude renders all messages in the DOM but hides them above the viewport.
   * Scrolling to top ensures the browser renders any deferred content and
   * triggers any "load earlier" lazy-loading that Claude may add in future.
   */
  async function hydrateConversation(timeoutMs = 7000) {
    const deadline = Date.now() + timeoutMs;

    const scroller =
      document.querySelector('[data-testid="conversation-content"]') ||
      document.querySelector('[class*="overflow-y-auto"]') ||
      document.querySelector('main');

    if (!scroller) return;

    const countTurns = () =>
      document.querySelectorAll(
        '[data-testid="human-turn"], [data-testid="ai-turn"], .human-turn, .ai-turn'
      ).length;

    let prev = countTurns();

    while (Date.now() < deadline) {
      // Click any "Load more" / "Show earlier messages" buttons
      document.querySelectorAll(
        'button[aria-label*="earlier"], button[class*="loadMore"]'
      ).forEach(btn => btn.click());

      scroller.scrollTo({ top: 0, behavior: 'instant' });
      await sleep(450);

      const curr = countTurns();
      if (curr === prev) break;
      prev = curr;
    }

    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    await sleep(150);
  }

  // ── Extraction helpers ───────────────────────────────────────────────────
  function extractTitle() {
    const h =
      document.querySelector('[data-testid="conversation-title"]') ||
      document.querySelector('h1');
    if (h) return h.textContent.trim();
    const t = document.title.replace(/\s*[-|]\s*Claude\s*$/i, '').trim();
    return (t && t !== 'Claude') ? t : 'Claude Conversation';
  }

  function extractModel() {
    const btn =
      document.querySelector('[data-testid="model-selector-dropdown"]') ||
      document.querySelector('[class*="modelName"]');
    return btn ? btn.textContent.trim() : null;
  }

  function extractMessages() {
    // Strategy 1: data-testid human/ai turn (current Claude)
    const all = Array.from(
      document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')
    );
    if (all.length > 0) {
      return all.map((el, i) => ({
        role:    el.dataset.testid === 'human-turn' ? 'user' : 'assistant',
        content: el.innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 2: class-based
    const cls = Array.from(document.querySelectorAll('.human-turn, .ai-turn'));
    if (cls.length > 0) {
      return cls.map((el, i) => ({
        role:    el.classList.contains('human-turn') ? 'user' : 'assistant',
        content: el.querySelector('.whitespace-pre-wrap')?.innerText.trim() || el.innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 3: font-claude-message / generic
    const font = Array.from(
      document.querySelectorAll('.font-claude-message, [class*="humanTurn"], [class*="aiTurn"]')
    );
    if (font.length > 0) {
      return font.map((el, i) => ({
        role:    el.classList.contains('font-claude-message') ? 'assistant' : 'user',
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
