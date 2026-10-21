/**
 * perplexity-cs.js — Content script for Perplexity (perplexity.ai)
 */

if (!window.__CW_PERPLEXITY_CS__) {
  window.__CW_PERPLEXITY_CS__ = true;

  function extractTitle() {
    const h = document.querySelector('h1') || document.querySelector('[class*="threadTitle"]');
    if (h) return h.textContent.trim();
    const t = document.title.replace(/\s*[-|]\s*Perplexity\s*$/i, '').trim();
    return (t && t !== 'Perplexity') ? t : 'Perplexity Conversation';
  }

  function extractMessages() {
    // Strategy 1: Q&A blocks
    const queries  = Array.from(document.querySelectorAll('[class*="UserMessage"], .whitespace-pre-line'));
    const answers  = Array.from(document.querySelectorAll('[class*="AnswerBody"], [class*="prose"]'));

    const messages = [];
    const maxLen = Math.max(queries.length, answers.length);
    for (let i = 0; i < maxLen; i++) {
      if (queries[i]) messages.push({ role: 'user',      content: queries[i].innerText.trim(), timestamp: null, index: messages.length });
      if (answers[i]) messages.push({ role: 'assistant', content: answers[i].innerText.trim(), timestamp: null, index: messages.length });
    }
    if (messages.filter(m => m.content).length > 0) return messages.filter(m => m.content);

    // Strategy 2: alternating blocks
    const blocks = Array.from(document.querySelectorAll('[data-testid*="query"], [data-testid*="answer"]'));
    if (blocks.length > 0) {
      return blocks.map((el, i) => ({
        role:    el.dataset.testid?.includes('query') ? 'user' : 'assistant',
        content: el.innerText.trim(),
        timestamp: null,
        index:   i,
      })).filter(m => m.content);
    }

    return null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'EXTRACT_CONVERSATION') return;
    try {
      const messages = extractMessages();
      if (!messages || messages.length === 0) {
        sendResponse({ ok: false, error: 'NO_MESSAGES', detail: 'No conversation found.' });
        return true;
      }
      sendResponse({
        ok: true,
        payload: {
          title:    extractTitle(),
          messages: messages.slice(0, 500),
          metadata: {
            model:           null,
            messageCount:    messages.length,
            charCount:       messages.reduce((n, m) => n + m.content.length, 0),
            extractorVersion:'1.0.0',
          },
        },
      });
    } catch (err) {
      sendResponse({ ok: false, error: 'EXTRACTION_FAILED', detail: String(err) });
    }
    return true;
  });
}
