/**
 * src/content/note-cs.ts — source for content-scripts/note-cs.js.
 *
 * Bundled with esbuild (see package.json's build:note-cs) rather than
 * hand-written, specifically so it can pull in Turndown — content scripts
 * can't do bare ESM imports at runtime, only a bundle can.
 *
 * On-page quick actions: a text-selection note bar, and a persistent
 * floating launcher button. Runs on chatgpt.com/chat.openai.com/claude.ai/
 * gemini.google.com (see manifest.json / manifest.dist.json). Independent
 * of chatgpt-cs.js / claude-cs.js / gemini-cs.js — those extract whole
 * conversations on request from the popup; this script renders its own UI
 * directly on the page so none of this needs the toolbar icon clicked.
 *
 * Two independent pieces of UI, each its own shadow-DOM host:
 *  1. Selection note bar (top-center, appears only while text is selected,
 *     or in "manual" mode with an empty textarea when opened from the
 *     launcher) — saves a one-message "note" capture into a chosen project.
 *  2. Launcher (bottom-right, always visible) — a small floating button
 *     that opens a menu with "Save a note", "Capture this conversation",
 *     and "Open dashboard".
 *
 * CAPTURE FORMAT: a selection is captured as HTML (via Range.cloneContents,
 * never innerHTML assignment — see below) and converted to Markdown with
 * Turndown + the GFM plugin (tables, strikethrough, task lists). Saving
 * plain selection.toString() would silently drop every code block, table,
 * list, and heading the user selected; capturing the HTML and converting it
 * to Markdown preserves all of that, and the dashboard renders it back with
 * react-markdown + Shiki + KaTeX (see src/components/markdown/).
 *
 * IMPORTANT: every DOM node in the injected UI is built with
 * document.createElement() + textContent — never innerHTML. Sites like
 * chatgpt.com enforce a Trusted Types CSP (`require-trusted-types-for
 * 'script'`), which throws on ANY innerHTML *assignment* unless wrapped in
 * a registered policy. A content script's JS runs in an isolated world, but
 * the DOM/document it writes to is the SAME document the page's CSP
 * governs — so an innerHTML assignment here would throw too, silently,
 * inside code with no caller to report the error to, and the UI would
 * simply never appear (this bit us once already with the note bar — see
 * git history). Reading `.innerHTML` (a getter, not a setter) to capture
 * selection HTML for Turndown is unaffected by Trusted Types — only writes
 * are restricted.
 */
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type {
  NoteGetProjectsResult,
  NoteSaveResult,
  LauncherCaptureRequest,
  LauncherCaptureResult,
} from '../types/messages';

declare global {
  interface Window {
    __CW_NOTE_CS__?: boolean;
  }
}

if (!window.__CW_NOTE_CS__) {
  window.__CW_NOTE_CS__ = true;

  const MIN_SELECTION_LENGTH = 2;
  const SELECTION_DEBOUNCE_MS = 150;
  const PREVIEW_MAX_CHARS = 100;
  const LAST_PROJECT_KEY = 'cw_note_last_project';
  const DASHBOARD_URL = 'http://localhost:3000';

  // ── HTML selection → Markdown (Turndown) ─────────────────────────────────

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndownService.use(gfm);

  /** Range.cloneContents() + reading .innerHTML — a getter, safe under Trusted Types. */
  function getSelectionHtml(selection: Selection): string {
    const container = document.createElement('div');
    for (let i = 0; i < selection.rangeCount; i++) {
      container.appendChild(selection.getRangeAt(i).cloneContents());
    }
    return container.innerHTML;
  }

  /** Falls back to plain text if the HTML capture is empty or Turndown throws on something unexpected. */
  function getSelectionMarkdown(selection: Selection, plainTextFallback: string): string {
    const html = getSelectionHtml(selection);
    if (!html.trim()) return cleanupText(plainTextFallback);
    try {
      const markdown = turndownService.turndown(html).trim();
      return cleanupText(markdown) || cleanupText(plainTextFallback);
    } catch (err) {
      console.error('[note-cs] Turndown conversion failed, falling back to plain text:', err);
      return cleanupText(plainTextFallback);
    }
  }

  // A selection boundary landing just after an opening quote glyph in the
  // source page (common with blockquote-styled chat messages) leaves a
  // stray, unmatched quote character stuck to the start/end of the capture.
  // Only stripped when genuinely unmatched — a real quotation with both a
  // matching open AND close quote is left alone.
  const QUOTE_PAIRS: Array<[string, string]> = [
    ['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’'],
  ];

  function stripOrphanEdgeQuotes(text: string): string {
    let result = text;
    for (const [open, close] of QUOTE_PAIRS) {
      if (result.startsWith(open) && !result.slice(open.length).includes(close)) {
        result = result.slice(open.length);
      }
      if (result.endsWith(close) && !result.slice(0, -close.length).includes(open)) {
        result = result.slice(0, -close.length);
      }
    }
    return result;
  }

  function cleanupText(text: string): string {
    return stripOrphanEdgeQuotes(text.trim()).trim();
  }

  const CSS_BAR = `
    :host { all: initial; }
    .bar {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 10px auto 0;
      padding: 10px;
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
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #c9c9cc;
    }
    .manual-input {
      box-sizing: border-box;
      width: 100%;
      min-height: 54px;
      resize: vertical;
      background: #2c2c2e;
      color: #f2f2f2;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 8px;
      padding: 6px 8px;
      font: inherit;
    }
    .bar-row { display: flex; align-items: center; gap: 8px; }
    select {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 200px;
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
    .primary { background: #4f8cff; color: white; }
    .primary:disabled { opacity: 0.5; cursor: default; }
    .subtle { background: transparent; color: #9a9a9e; font-weight: 400; padding: 4px 6px; }
    .status { flex: 1 1 auto; min-width: 0; color: #9a9a9e; }
    .status.error { color: #ff8080; }
    .status.success { color: #63d68a; }
  `;

  const CSS_LAUNCHER = `
    :host { all: initial; }
    .root {
      position: relative;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .fab {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #1c1c1e;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      border: none;
      cursor: pointer;
      pointer-events: auto;
      transition: transform 120ms ease;
    }
    .fab:hover { transform: scale(1.06); }
    .menu {
      position: absolute;
      bottom: 54px;
      right: 0;
      width: 250px;
      background: #1c1c1e;
      color: #f2f2f2;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      padding: 8px;
      display: none;
      flex-direction: column;
      gap: 4px;
      pointer-events: auto;
    }
    .menu.open { display: flex; }
    .menu-project {
      background: #2c2c2e;
      color: #f2f2f2;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 7px;
      padding: 6px 8px;
      font: inherit;
      margin-bottom: 4px;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      color: #f2f2f2;
      padding: 8px;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }
    .menu-item:hover { background: rgba(255,255,255,0.08); }
    .menu-item:disabled { opacity: 0.45; cursor: default; }
    .menu-status { padding: 2px 8px 4px; color: #9a9a9e; font-size: 12px; }
    .menu-status.error { color: #ff8080; }
    .menu-status.success { color: #63d68a; }
  `;

  // ── Shared helpers ─────────────────────────────────────────────────────

  function isEditableContext(node: Node | null): boolean {
    let el: HTMLElement | null =
      node && node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement ?? null;
    while (el) {
      if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
      el = el.parentElement;
    }
    return false;
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  interface SelectOption { value: string; label: string }

  function setSelectOptions(select: HTMLSelectElement, options: SelectOption[]): void {
    while (select.firstChild) select.removeChild(select.firstChild);
    for (const { value, label } of options) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label; // textContent — safe by construction, no innerHTML anywhere
      select.appendChild(opt);
    }
  }

  function fetchProjects(callback: (response: NoteGetProjectsResult | undefined) => void): void {
    chrome.runtime.sendMessage({ type: 'NOTE_GET_PROJECTS' }, callback);
  }

  function applyLastProject(select: HTMLSelectElement, projects: Array<{ id: string; name: string }>): void {
    chrome.storage.local.get(LAST_PROJECT_KEY, (stored) => {
      const lastId = stored?.[LAST_PROJECT_KEY] as string | undefined;
      if (lastId && projects.some((p) => p.id === lastId)) select.value = lastId;
    });
  }

  function withinAnyOwnUi(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    return (
      (!!barHostEl && (target === barHostEl || barHostEl.contains(target))) ||
      (!!launcherHostEl && (target === launcherHostEl || launcherHostEl.contains(target)))
    );
  }

  // ── Note bar (selection mode, or manual mode from the launcher) ─────────

  interface BarEls {
    el: HTMLDivElement;
    preview: HTMLDivElement;
    manualInput: HTMLTextAreaElement;
    select: HTMLSelectElement;
    status: HTMLSpanElement;
    saveBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
  }

  let barHostEl: HTMLDivElement | null = null;
  let bar: BarEls | null = null;
  let barMode: 'selection' | 'manual' = 'selection';
  let pendingText = '';
  let pendingPromptText: string | null = null;
  let projectsLoadedInBar = false;

  // ── Preceding-question lookup (best-effort, defensive) ───────────────────
  // Per-platform DOM structure, exactly matching the selectors background.ts
  // already uses for full-conversation extraction. Never throws outward —
  // any failure (unrecognized platform, DOM shape changed, selection not
  // inside a turn) just means no prompt_text, never blocks saving the note.

  const PROMPT_LOOKUP_MAX_CHARS = 2000;

  function detectPlatform(): 'chatgpt' | 'claude' | 'gemini' | null {
    const host = location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    return null;
  }

  function findPrecedingPrompt(selection: Selection): string | null {
    try {
      const anchorNode = selection.anchorNode;
      if (!anchorNode) return null;
      const anchorEl: Element | null =
        anchorNode.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode.parentElement;
      if (!anchorEl) return null;

      const platform = detectPlatform();
      if (!platform) return null;

      let turnSelector: string;
      let isUserTurn: (el: Element) => boolean;

      if (platform === 'chatgpt') {
        turnSelector = '[data-message-author-role]';
        isUserTurn = (el) => el.getAttribute('data-message-author-role') === 'user';
      } else if (platform === 'claude') {
        turnSelector = '[data-testid="human-turn"],[data-testid="ai-turn"]';
        isUserTurn = (el) => el.getAttribute('data-testid') === 'human-turn';
      } else {
        turnSelector = 'user-query,model-response';
        isUserTurn = (el) => el.tagName.toLowerCase() === 'user-query';
      }

      const turns = Array.from(document.querySelectorAll(turnSelector));
      if (!turns.length) return null;

      const containingTurn = anchorEl.closest(turnSelector);
      const containingIndex = containingTurn ? turns.indexOf(containingTurn) : -1;
      const startIndex = containingIndex >= 0 ? containingIndex : turns.length;

      for (let i = startIndex - 1; i >= 0; i--) {
        if (isUserTurn(turns[i])) {
          const text = (turns[i] as HTMLElement).innerText?.trim();
          return text ? truncate(text, PROMPT_LOOKUP_MAX_CHARS) : null;
        }
      }
      return null;
    } catch (err) {
      console.error('[note-cs] findPrecedingPrompt failed (non-fatal, no prompt_text this time):', err);
      return null;
    }
  }

  function ensureBar(): void {
    if (barHostEl) return;

    barHostEl = document.createElement('div');
    barHostEl.id = 'cw-note-bar-host';
    barHostEl.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647; pointer-events: none;';

    const shadow = barHostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS_BAR;
    shadow.appendChild(style);

    const barEl = document.createElement('div');
    barEl.className = 'bar';

    const preview = document.createElement('div');
    preview.className = 'preview';

    const manualInput = document.createElement('textarea');
    manualInput.className = 'manual-input';
    manualInput.placeholder = 'Type your note…';
    manualInput.hidden = true;

    const row = document.createElement('div');
    row.className = 'bar-row';

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Project');
    setSelectOptions(select, [{ value: '', label: 'Loading projects…' }]);

    const status = document.createElement('span');
    status.className = 'status';
    status.hidden = true;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'primary';
    saveBtn.textContent = 'Save Note';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'subtle';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '✕';

    row.append(select, status, saveBtn, closeBtn);
    barEl.append(preview, manualInput, row);
    shadow.appendChild(barEl);
    document.body.appendChild(barHostEl);

    bar = { el: barEl, preview, manualInput, select, status, saveBtn, closeBtn };
    bar.saveBtn.addEventListener('click', onSaveNote);
    bar.closeBtn.addEventListener('click', hideBar);
  }

  function setBarStatus(text: string, kind?: 'error' | 'success'): void {
    if (!bar) return;
    bar.status.textContent = text || '';
    bar.status.className = `status${kind ? ` ${kind}` : ''}`;
    bar.status.hidden = !text;
  }

  function loadProjectsIntoBar(): void {
    if (!bar) return;
    setSelectOptions(bar.select, [{ value: '', label: 'Loading projects…' }]);
    fetchProjects((response) => {
      if (chrome.runtime.lastError || !response?.ok || !bar) {
        if (bar) {
          setSelectOptions(bar.select, [{ value: '', label: 'Backend unavailable' }]);
          bar.saveBtn.disabled = true;
        }
        return;
      }
      projectsLoadedInBar = true;
      const projects = response.projects;
      if (!projects.length) {
        setSelectOptions(bar.select, [{ value: '', label: 'Create a project first' }]);
        bar.saveBtn.disabled = true;
        return;
      }
      bar.saveBtn.disabled = false;
      setSelectOptions(bar.select, projects.map((p) => ({ value: p.id, label: p.name })));
      applyLastProject(bar.select, projects);
    });
  }

  /** markdownText is what gets saved; previewText is what the (truncated, plain-text) bar preview shows. */
  function showBar(markdownText: string, previewText: string, promptText: string | null): void {
    ensureBar();
    if (!bar) return;
    barMode = 'selection';
    pendingText = markdownText;
    pendingPromptText = promptText;
    bar.preview.hidden = false;
    bar.preview.textContent = truncate(previewText, PREVIEW_MAX_CHARS);
    bar.manualInput.hidden = true;
    setBarStatus('');
    bar.saveBtn.disabled = false;
    bar.saveBtn.textContent = 'Save Note';
    bar.el.classList.add('visible');
    if (!projectsLoadedInBar) loadProjectsIntoBar();
  }

  function showManualNoteBar(): void {
    ensureBar();
    if (!bar) return;
    barMode = 'manual';
    pendingText = '';
    pendingPromptText = null;
    bar.preview.hidden = true;
    bar.manualInput.hidden = false;
    bar.manualInput.value = '';
    setBarStatus('');
    bar.saveBtn.disabled = false;
    bar.saveBtn.textContent = 'Save Note';
    bar.el.classList.add('visible');
    if (!projectsLoadedInBar) loadProjectsIntoBar();
    bar.manualInput.focus();
  }

  function hideBar(): void {
    if (bar?.el) bar.el.classList.remove('visible');
    pendingText = '';
  }

  function onSaveNote(): void {
    if (!bar) return;
    const projectId = bar.select.value;
    const text = (barMode === 'manual' ? bar.manualInput.value : pendingText).trim();
    if (!projectId || !text) return;

    chrome.storage.local.set({ [LAST_PROJECT_KEY]: projectId });
    bar.saveBtn.disabled = true;
    bar.saveBtn.textContent = 'Saving…';
    setBarStatus('');

    chrome.runtime.sendMessage(
      {
        type: 'NOTE_SAVE_REQUEST',
        projectId,
        text,
        url: location.href,
        pageTitle: document.title || '',
        kind: barMode === 'manual' ? 'written' : 'captured',
        promptText: barMode === 'manual' ? null : pendingPromptText,
      },
      (response: NoteSaveResult | undefined) => {
        if (!bar) return;
        if (chrome.runtime.lastError || !response?.ok) {
          setBarStatus((response && !response.ok && response.error) || 'Save failed.', 'error');
          bar.saveBtn.disabled = false;
          bar.saveBtn.textContent = 'Save Note';
          return;
        }
        setBarStatus('Saved ✓', 'success');
        bar.saveBtn.textContent = 'Saved ✓';
        setTimeout(hideBar, 1100);
      },
    );
  }

  // ── Launcher (persistent floating button + quick-action menu) ───────────

  interface LauncherEls {
    fab: HTMLButtonElement;
    menu: HTMLDivElement;
    projectSelect: HTMLSelectElement;
    menuStatus: HTMLDivElement;
    saveNoteItem: HTMLButtonElement;
    captureItem: HTMLButtonElement;
    dashboardItem: HTMLButtonElement;
  }

  let launcherHostEl: HTMLDivElement | null = null;
  let launcher: LauncherEls | null = null;
  let launcherProjectsLoaded = false;

  function buildLogoMark(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('fill', 'none');
    const opacities = [0.95, 0.5, 0.5, 0.95];
    const coords: Array<[number, number]> = [[1, 1], [7, 1], [1, 7], [7, 7]];
    coords.forEach(([x, y], i) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '4');
      rect.setAttribute('height', '4');
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', 'white');
      rect.setAttribute('fill-opacity', String(opacities[i]));
      svg.appendChild(rect);
    });
    return svg;
  }

  function ensureLauncher(): void {
    if (launcherHostEl) return;

    launcherHostEl = document.createElement('div');
    launcherHostEl.id = 'cw-launcher-host';
    launcherHostEl.style.cssText =
      'all: initial; position: fixed; bottom: 20px; right: 20px; z-index: 2147483646; pointer-events: none;';

    const shadow = launcherHostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS_LAUNCHER;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'root';

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Context Workspace quick actions');
    fab.appendChild(buildLogoMark());

    const menu = document.createElement('div');
    menu.className = 'menu';

    const projectSelect = document.createElement('select');
    projectSelect.className = 'menu-project';
    setSelectOptions(projectSelect, [{ value: '', label: 'Loading projects…' }]);

    const menuStatus = document.createElement('div');
    menuStatus.className = 'menu-status';
    menuStatus.hidden = true;

    const saveNoteItem = document.createElement('button');
    saveNoteItem.type = 'button';
    saveNoteItem.className = 'menu-item';
    saveNoteItem.textContent = '📝 Save a note';

    const captureItem = document.createElement('button');
    captureItem.type = 'button';
    captureItem.className = 'menu-item';
    captureItem.textContent = '📥 Capture this conversation';

    const dashboardItem = document.createElement('button');
    dashboardItem.type = 'button';
    dashboardItem.className = 'menu-item';
    dashboardItem.textContent = '↗ Open dashboard';

    menu.append(projectSelect, menuStatus, saveNoteItem, captureItem, dashboardItem);
    root.append(fab, menu);
    shadow.appendChild(root);
    document.body.appendChild(launcherHostEl);

    launcher = { fab, menu, projectSelect, menuStatus, saveNoteItem, captureItem, dashboardItem };

    fab.addEventListener('click', toggleLauncherMenu);
    saveNoteItem.addEventListener('click', () => {
      closeLauncherMenu();
      showManualNoteBar();
    });
    captureItem.addEventListener('click', onLauncherCapture);
    dashboardItem.addEventListener('click', () => {
      window.open(DASHBOARD_URL, '_blank', 'noopener,noreferrer');
      closeLauncherMenu();
    });

    document.addEventListener('click', (e) => {
      if (launcher?.menu.classList.contains('open') && !withinAnyOwnUi(e.target)) closeLauncherMenu();
    });
  }

  function setMenuStatus(text: string, kind?: 'error' | 'success'): void {
    if (!launcher) return;
    launcher.menuStatus.textContent = text || '';
    launcher.menuStatus.className = `menu-status${kind ? ` ${kind}` : ''}`;
    launcher.menuStatus.hidden = !text;
  }

  function loadProjectsIntoLauncher(): void {
    if (!launcher) return;
    setSelectOptions(launcher.projectSelect, [{ value: '', label: 'Loading projects…' }]);
    fetchProjects((response) => {
      if (chrome.runtime.lastError || !response?.ok || !launcher) {
        if (launcher) {
          setSelectOptions(launcher.projectSelect, [{ value: '', label: 'Backend unavailable' }]);
          launcher.saveNoteItem.disabled = true;
          launcher.captureItem.disabled = true;
        }
        return;
      }
      launcherProjectsLoaded = true;
      const projects = response.projects;
      if (!projects.length) {
        setSelectOptions(launcher.projectSelect, [{ value: '', label: 'Create a project first' }]);
        launcher.saveNoteItem.disabled = true;
        launcher.captureItem.disabled = true;
        return;
      }
      launcher.saveNoteItem.disabled = false;
      launcher.captureItem.disabled = false;
      setSelectOptions(launcher.projectSelect, projects.map((p) => ({ value: p.id, label: p.name })));
      applyLastProject(launcher.projectSelect, projects);
    });
  }

  function toggleLauncherMenu(): void {
    if (!launcher) return;
    if (launcher.menu.classList.contains('open')) {
      closeLauncherMenu();
      return;
    }
    launcher.menu.classList.add('open');
    setMenuStatus('');
    if (!launcherProjectsLoaded) loadProjectsIntoLauncher();
  }

  function closeLauncherMenu(): void {
    launcher?.menu.classList.remove('open');
  }

  function onLauncherCapture(): void {
    if (!launcher) return;
    const projectId = launcher.projectSelect.value;
    if (!projectId) return;

    chrome.storage.local.set({ [LAST_PROJECT_KEY]: projectId });
    launcher.captureItem.disabled = true;
    launcher.saveNoteItem.disabled = true;
    setMenuStatus('Capturing…');

    const request: LauncherCaptureRequest = { type: 'LAUNCHER_CAPTURE_REQUEST', projectId };
    chrome.runtime.sendMessage(request, (response: LauncherCaptureResult | undefined) => {
      if (!launcher) return;
      launcher.captureItem.disabled = false;
      launcher.saveNoteItem.disabled = false;
      if (chrome.runtime.lastError || !response?.ok) {
        setMenuStatus((response && !response.ok && response.error) || 'Capture failed.', 'error');
        return;
      }
      setMenuStatus(`Captured "${truncate(response.title || 'conversation', 40)}" ✓`, 'success');
      setTimeout(closeLauncherMenu, 1800);
    });
  }

  // ── Selection tracking (drives the note bar's selection mode) ───────────

  let selectionTimer: ReturnType<typeof setTimeout> | null = null;

  function evaluateSelection(event: Event | undefined): void {
    if (event && withinAnyOwnUi(event.target)) return; // interacting with our own UI

    const selection = window.getSelection();
    const plainText = selection ? selection.toString().trim() : '';

    if (plainText.length < MIN_SELECTION_LENGTH) {
      // Only auto-hide a selection-mode bar that isn't mid-save, and never
      // yank away a manual-mode bar just because there's no page selection
      // (there never is one in manual mode).
      if (barHostEl && barMode === 'selection' && bar?.saveBtn.textContent === 'Save Note') hideBar();
      return;
    }

    if (!selection || isEditableContext(selection.anchorNode)) return; // don't hijack the compose box

    try {
      const cleanPlainText = cleanupText(plainText);
      const markdown = getSelectionMarkdown(selection, cleanPlainText);
      const promptText = findPrecedingPrompt(selection);
      showBar(markdown, cleanPlainText, promptText);
    } catch (err) {
      console.error('[note-cs] failed to show note bar:', err);
    }
  }

  function onSelectionMaybeChanged(event: Event): void {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => evaluateSelection(event), SELECTION_DEBOUNCE_MS);
  }

  document.addEventListener('mouseup', onSelectionMaybeChanged);
  document.addEventListener('keyup', onSelectionMaybeChanged);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideBar();
      closeLauncherMenu();
    }
  });

  try {
    ensureLauncher();
  } catch (err) {
    console.error('[note-cs] failed to render launcher:', err);
  }

  console.debug('[note-cs] loaded on', location.hostname);
}
