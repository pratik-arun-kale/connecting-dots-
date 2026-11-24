/**
 * chatgpt-cs.js — Content script for ChatGPT (chatgpt.com, chat.openai.com)
 *
 * Responsibilities:
 *  1. Detect UI readiness / auth-required → notify background SW
 *  2. Auto-scroll + hydrate conversation DOM before extraction
 *  3. Extract full conversation on EXTRACT_CONVERSATION request
 */

if (!window.__CW_CHATGPT_CS__) {
  window.__CW_CHATGPT_CS__ = true;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // ── Auto-scroll hydration ────────────────────────────────────────────────
  /**
   * Scrolls the conversation container to force lazy-loaded messages into the DOM.
   * ChatGPT paginates long conversations — older messages only render when scrolled up.
   * Strategy:
   *  1. Find the scrollable conversation container.
   *  2. Scroll to the very top to trigger loading of oldest messages.
   *  3. Wait for DOM to settle, check message count.
   *  4. Repeat until count stabilises (no new messages loaded) or timeout.
   *  5. Scroll back to bottom.
   */
  async function hydrateConversation(timeoutMs = 9000) {
    const deadline = Date.now() + timeoutMs;

    // Find the scrollable pane (main scroll container in ChatGPT)
    const scroller =
      document.querySelector('[data-testid="conversation-turn-0"]')
        ?.closest('[class*="overflow-y"]') ||
      document.querySelector('main [class*="overflow-y-auto"]') ||
      document.querySelector('main');

    if (!scroller) return;

    const countMessages = () =>
      document.querySelectorAll('[data-message-author-role]').length;

    let prevCount = countMessages();

    // Scroll to top in steps — each step may reveal more messages
    while (Date.now() < deadline) {
      // Click any "Load earlier messages" / "Continue" buttons
      document.querySelectorAll(
        'button[data-testid*="load-more"], button[aria-label*="Load more"]'
      ).forEach(btn => btn.click());

      scroller.scrollTo({ top: 0, behavior: 'instant' });
      await sleep(500);

      const newCount = countMessages();
      if (newCount === prevCount) break;   // no new messages loaded
      prevCount = newCount;
    }

    // Return to bottom so the user sees the latest messages
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    await sleep(150);
  }

  // ── Extraction helpers ───────────────────────────────────────────────────
  function extractTitle() {
    const t = document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, '').trim();
    if (t && t !== 'ChatGPT') return t;
    const nav = document.querySelector('nav [aria-current="page"]');
    return nav ? nav.textContent.trim() : 'ChatGPT Conversation';
  }

  function extractModel() {
    const btn = document.querySelector('[data-testid="model-switcher-dropdown-button"]');
    if (btn) return btn.textContent.trim();
    const m = document.title.match(/\b(GPT-4[^\s,)]*|o\d[^\s,)]*)/i);
    return m ? m[1] : null;
  }

  function extractMessages() {
    // Strategy 1: semantic role attribute
    const byRole = Array.from(document.querySelectorAll('[data-message-author-role]'));
    if (byRole.length > 0) {
      return byRole.map((el, i) => ({
        role: el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant',
        content: (
          el.querySelector('.whitespace-pre-wrap') ||
          el.querySelector('.markdown') ||
          el
        ).innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 2: conversation-turn articles
    const articles = Array.from(
      document.querySelectorAll('article[data-testid^="conversation-turn"]')
    );
    if (articles.length > 0) {
      return articles.map((el, i) => ({
        role: el.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant',
        content: el.innerText.trim(),
        timestamp: null,
        index: i,
      })).filter(m => m.content);
    }

    // Strategy 3: group blocks (fallback)
    const groups = Array.from(document.querySelectorAll('[class*="group/conversation"]'));
    if (groups.length > 0) {
      return groups.map((el, i) => ({
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

    // Hydrate (scroll to load all messages) THEN extract — always async
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

    return true; // async response
  });
}
