/**
 * note-cs.js — Content script for quick text-selection notes.
 *
 * Runs on chatgpt.com/chat.openai.com/claude.ai/gemini.google.com (see
 * manifest.json / manifest.dist.json). Independent of chatgpt-cs.js /
 * claude-cs.js / gemini-cs.js — those extract whole conversations on
 * request; this one watches for the user selecting text and offers to save
 * just that selection as a note into a chosen project.
 *
 * Flow:
 *  1. User selects text on the page.
 *  2. A small floating bar appears fixed to the top of the viewport, built
 *     inside a shadow root so the host page's CSS can't distort it (and ours
 *     can't leak out).
 *  3. Bar shows a preview of the selection + a project <select> (populated
 *     via a message to background, which owns all backend calls) + Save.
 *  4. Save sends the text to background, which uploads it as a one-message
 *     "note" capture (platform: "note") into the chosen project.
 */

if (!window.__CW_NOTE_CS__) {
  window.__CW_NOTE_CS__ = true;

  const MIN_SELECTION_LENGTH = 2;
  const SELECTION_DEBOUNCE_MS = 150;
  const PREVIEW_MAX_CHARS = 100;
  const LAST_PROJECT_KEY = 'cw_note_last_project';

  let hostEl = null;
  let shadow = null;
  let els = {};
  let pendingText = '';
  let selectionTimer = null;
  let projectsLoaded = false;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isEditableContext(node) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (el) {
      if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
      el = el.parentElement;
    }
    return false;
  }

  function withinOwnUi(target) {
    return !!hostEl && target instanceof Node && (target === hostEl || hostEl.contains(target));
  }

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  // ── Shadow-DOM UI ────────────────────────────────────────────────────────

  function ensureUi() {
    if (hostEl) return;

    hostEl = document.createElement('div');
    hostEl.id = 'cw-note-host';
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.top = '0';
    hostEl.style.left = '0';
    hostEl.style.width = '100%';
    hostEl.style.zIndex = '2147483647';
    hostEl.style.pointerEvents = 'none';

    shadow = hostEl.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 10px auto 0;
          padding: 8px 10px;
          max-width: 640px;
          width: calc(100% - 32px);
          background: #1c1c1e;
          color: #f2f2f2;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          pointer-events: auto;
          opacity: 0;
          transform: translateY(-8px);
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .bar.visible { opacity: 1; transform: translateY(0); }
        .preview {
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #c9c9cc;
        }
        select {
          flex: 0 0 auto;
          max-width: 160px;
          background: #2c2c2e;
          color: #f2f2f2;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 7px;
          padding: 5px 6px;
          font: inherit;
        }
        button {
          flex: 0 0 auto;
          border: none;
          border-radius: 7px;
          padding: 6px 12px;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .save {
          background: #4f8cff;
          color: white;
        }
        .save:disabled { opacity: 0.5; cursor: default; }
        .close {
          background: transparent;
          color: #9a9a9e;
          font-weight: 400;
          padding: 4px 6px;
        }
        .status {
          flex: 0 0 auto;
          color: #9a9a9e;
        }
        .status.error { color: #ff8080; }
        .status.success { color: #63d68a; }
      </style>
      <div class="bar" part="bar">
        <span class="preview"></span>
        <select aria-label="Project"><option value="">Loading projects…</option></select>
        <span class="status" hidden></span>
        <button class="save" type="button">Save Note</button>
        <button class="close" type="button" aria-label="Dismiss">✕</button>
      </div>
    `;

    document.documentElement.appendChild(hostEl);

    els = {
      bar: shadow.querySelector('.bar'),
      preview: shadow.querySelector('.preview'),
      select: shadow.querySelector('select'),
      status: shadow.querySelector('.status'),
      saveBtn: shadow.querySelector('.save'),
      closeBtn: shadow.querySelector('.close'),
    };

    els.saveBtn.addEventListener('click', onSave);
    els.closeBtn.addEventListener('click', hideBar);
  }

  function setStatus(text, kind) {
    els.status.textContent = text || '';
    els.status.className = `status${kind ? ` ${kind}` : ''}`;
    els.status.hidden = !text;
  }

  function showBar(text) {
    ensureUi();
    pendingText = text;
    els.preview.textContent = truncate(text, PREVIEW_MAX_CHARS);
    setStatus('');
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = 'Save Note';
    els.bar.classList.add('visible');
    if (!projectsLoaded) loadProjects();
  }

  function hideBar() {
    if (els.bar) els.bar.classList.remove('visible');
    pendingText = '';
  }

  // ── Backend calls (routed through background — it owns fetch/CORS/errors) ─

  function loadProjects() {
    els.select.innerHTML = '<option value="">Loading projects…</option>';
    chrome.runtime.sendMessage({ type: 'NOTE_GET_PROJECTS' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        els.select.innerHTML = '<option value="">Backend unavailable</option>';
        els.saveBtn.disabled = true;
        return;
      }
      projectsLoaded = true;
      const projects = response.projects || [];
      if (!projects.length) {
        els.select.innerHTML = '<option value="">Create a project first</option>';
        els.saveBtn.disabled = true;
        return;
      }
      els.saveBtn.disabled = false;
      els.select.innerHTML = projects
        .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
        .join('');
      chrome.storage.local.get(LAST_PROJECT_KEY, (stored) => {
        const lastId = stored?.[LAST_PROJECT_KEY];
        if (lastId && projects.some(p => p.id === lastId)) {
          els.select.value = lastId;
        }
      });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function onSave() {
    const projectId = els.select.value;
    if (!projectId || !pendingText.trim()) return;

    chrome.storage.local.set({ [LAST_PROJECT_KEY]: projectId });
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = 'Saving…';
    setStatus('');

    chrome.runtime.sendMessage(
      {
        type: 'NOTE_SAVE_REQUEST',
        projectId,
        text: pendingText,
        url: location.href,
        pageTitle: document.title || '',
      },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          setStatus(response?.error || 'Save failed.', 'error');
          els.saveBtn.disabled = false;
          els.saveBtn.textContent = 'Save Note';
          return;
        }
        setStatus('Saved ✓', 'success');
        els.saveBtn.textContent = 'Saved ✓';
        setTimeout(hideBar, 1100);
      },
    );
  }

  // ── Selection tracking ───────────────────────────────────────────────────

  function evaluateSelection(event) {
    if (event && withinOwnUi(event.target)) return; // interacting with our own bar

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (text.length < MIN_SELECTION_LENGTH) {
      // Only auto-hide if the bar isn't mid-save; don't yank it away from
      // under a user who's about to click Save (selection can visually
      // collapse on some sites during click-down before mouseup fires).
      if (hostEl && els.saveBtn && els.saveBtn.textContent === 'Save Note') hideBar();
      return;
    }

    if (isEditableContext(selection.anchorNode)) return; // don't hijack the compose box

    showBar(text);
  }

  function onSelectionMaybeChanged(event) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => evaluateSelection(event), SELECTION_DEBOUNCE_MS);
  }

  document.addEventListener('mouseup', onSelectionMaybeChanged);
  document.addEventListener('keyup', onSelectionMaybeChanged);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideBar();
  });
}
