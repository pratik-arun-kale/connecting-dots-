/**
 * popup.js — Context Workspace Popup (three-tab rewrite)
 * ========================================================
 * Self-contained: no imports from store/state.js or services/api.js.
 * background.ts and content scripts are NOT modified.
 *
 * Tabs: Capture | Projects | Saved
 * Storage keys: selected_project_id, active_popup_tab
 */

// ── Constants ────────────────────────────────────────────────────────────────

const API = 'http://localhost:8000/api/v1';

const STORAGE = {
  selectedProject: 'selected_project_id',
  activeTab:       'active_popup_tab',
};

const PLATFORM_HOSTS = {
  'chatgpt.com':       'chatgpt',
  'chat.openai.com':   'chatgpt',
  'claude.ai':         'claude',
  'gemini.google.com': 'gemini',
};

const PLATFORM_LABEL = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
const TERMINAL = new Set(['completed', 'failed']);

// ── App state (in-memory, rebuilt every popup open) ───────────────────────────

const S = {
  online:            false,
  currentTab:        'capture',
  projects:          [],          // ApiProject[]
  selectedProjectId: null,        // string | null
  activeTabInfo:     null,        // { url, title, platform } | null
  captureContexts:   [],          // ApiContext[] for selected project
  allContexts:       [],          // ApiContext[] across all projects (saved tab)
  projectMap:        {},          // { [projectId]: name }
  capturing:         false,
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(6000),
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
  }
  return res.json();
}

async function healthCheck() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchProjects() {
  const data = await apiFetch('/projects?limit=50');
  return data.items ?? [];
}

async function fetchContexts(projectId, limit = 5) {
  const data = await apiFetch(`/projects/${projectId}/contexts?limit=${limit}`);
  return data.items ?? [];
}

async function fetchSessions(projectId) {
  const data = await apiFetch(`/sessions/${projectId}?limit=50`);
  return data.items ?? [];
}

async function createSession(projectId, platform) {
  return apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, source_platform: platform }),
  });
}

async function doApiCapture(sessionId, platform, url, title) {
  return apiFetch('/contexts/capture', {
    method: 'POST',
    body: JSON.stringify({
      session_id:  sessionId,
      platform,
      url,
      // messages:[] ensures the frontend component renders a preview area
      // rather than "No messages extracted." for popup-captured contexts.
      raw_content: { title, url, captured_at: new Date().toISOString(), messages: [] },
    }),
  });
}

async function apiCreateProject(name) {
  return apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageGet(keys) {
  return new Promise((res) => chrome.storage.local.get(keys, res));
}

function storageSet(obj) {
  return new Promise((res) => chrome.storage.local.set(obj, res));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

function dateGroup(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86_400_000);
  const item      = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (item.getTime() === today.getTime())     return 'Today';
  if (item.getTime() === yesterday.getTime()) return 'Yesterday';
  return 'Earlier';
}

function platformFromUrl(url) {
  try {
    return PLATFORM_HOSTS[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}

function badgeHtml(platform) {
  const cls = platform ? `badge-${platform}` : 'badge-unknown';
  const lbl = PLATFORM_LABEL[platform] ?? 'Unknown';
  return `<span class="badge ${esc(cls)}">${esc(lbl)}</span>`;
}

function ctxTitle(ctx) {
  return ctx.raw_content?.title
    ?? ctx.raw_content?.url
    ?? 'Untitled';
}

function ctxPreview(ctx) {
  const msgs = ctx.raw_content?.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    return msgs[0].content?.substring(0, 120) ?? '';
  }
  return ctx.raw_content?.url ?? '';
}

function ctxPlatform(ctx) {
  return ctx.metadata?.platform ?? platformFromUrl(ctx.raw_content?.url ?? '') ?? null;
}

// ── Platform detection ─────────────────────────────────────────────────────────

async function detectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const platform = platformFromUrl(tab.url);
    if (!platform) return null;
    return { url: tab.url, title: tab.title ?? tab.url, platform };
  } catch {
    return null;
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────

function setOfflineBanner(show) {
  document.getElementById('offlineBanner').hidden = !show;
}

function setStatusDot(online) {
  const dot = document.getElementById('statusDot');
  dot.classList.toggle('online',  online);
  dot.classList.toggle('offline', !online);
}

function renderDetectBanner(info) {
  const empty = document.getElementById('detect-empty');
  const card  = document.getElementById('detect-card');
  if (!info) {
    empty.hidden = false;
    card.hidden  = true;
    return;
  }
  empty.hidden = true;
  card.hidden  = false;
  document.getElementById('detect-badge').className = `badge badge-${info.platform}`;
  document.getElementById('detect-badge').textContent = PLATFORM_LABEL[info.platform] ?? info.platform;
  document.getElementById('detect-title').textContent = info.title;
  try {
    const u = new URL(info.url);
    document.getElementById('detect-url').textContent = u.hostname + u.pathname.slice(0, 40);
  } catch {
    document.getElementById('detect-url').textContent = info.url.slice(0, 50);
  }
}

function setCaptureBtn(state) {
  const btn  = document.getElementById('captureBtn');
  const text = document.getElementById('captureBtnText');
  const kbd  = document.getElementById('captureShortcut');

  btn.disabled = true;
  btn.className = 'capture-btn';

  switch (state) {
    case 'offline':
      text.textContent = 'Backend offline';
      kbd.hidden = true;
      break;
    case 'no-platform':
      text.textContent = 'Open a ChatGPT, Claude, or Gemini conversation';
      kbd.hidden = true;
      break;
    case 'no-project':
      text.textContent = 'Select a project to save to';
      kbd.hidden = true;
      break;
    case 'ready':
      btn.disabled = false;
      text.textContent = 'Capture this conversation';
      kbd.hidden = false;
      break;
    case 'loading':
      text.textContent = 'Capturing…';
      kbd.hidden = true;
      break;
    case 'success':
      btn.className = 'capture-btn success';
      text.textContent = 'Captured ✓';
      kbd.hidden = true;
      break;
    case 'error':
      btn.className = 'capture-btn error';
      btn.disabled = false;
      text.textContent = 'Failed — try again';
      kbd.hidden = true;
      break;
  }
}

function deriveCaptureState() {
  if (!S.online)            return 'offline';
  if (!S.activeTabInfo)     return 'no-platform';
  if (!S.selectedProjectId) return 'no-project';
  return 'ready';
}

// ── Render pills ──────────────────────────────────────────────────────────────

function renderPills() {
  const wrap = document.getElementById('pillsScroll');
  if (S.projects.length === 0) {
    wrap.innerHTML = `<span style="font-size:12px;color:var(--muted)">No projects yet</span>`;
    return;
  }
  wrap.innerHTML = S.projects.map((p) => {
    const sel = p.id === S.selectedProjectId;
    return `<button class="pill${sel ? ' selected' : ''}" data-pid="${esc(p.id)}">${esc(p.name)}</button>`;
  }).join('');

  wrap.querySelectorAll('.pill[data-pid]').forEach((btn) => {
    btn.addEventListener('click', () => selectProject(btn.dataset.pid));
  });
}

// ── Render recent captures (capture tab) ──────────────────────────────────────

function renderRecentCaptures() {
  const el = document.getElementById('recentCaptures');
  if (!S.selectedProjectId) {
    el.innerHTML = `<div class="empty-row" style="padding:16px"><span style="font-size:12px;color:var(--muted)">Select a project to see recent captures</span></div>`;
    return;
  }
  if (S.captureContexts.length === 0) {
    el.innerHTML = `<div class="empty-row">
      <i class="ti ti-photo-off"></i>
      No captures yet for this project
    </div>`;
    return;
  }
  el.innerHTML = S.captureContexts.slice(0, 5).map((ctx) => {
    const plat    = ctxPlatform(ctx);
    const title   = ctxTitle(ctx);
    const preview = ctxPreview(ctx);
    return `
      <div class="ctx-card" data-url="${esc(ctx.raw_content?.url ?? '')}">
        <div class="ctx-card-top">
          <span class="ctx-title">${esc(title)}</span>
          <span class="ctx-time">${timeAgo(ctx.created_at)}</span>
        </div>
        <div class="ctx-card-top" style="margin-bottom:0;margin-top:3px">
          ${badgeHtml(plat)}
        </div>
        ${preview ? `<div class="ctx-preview">${esc(preview)}</div>` : ''}
      </div>`;
  }).join('');

  el.querySelectorAll('.ctx-card[data-url]').forEach((card) => {
    const url = card.dataset.url;
    if (url) card.addEventListener('click', () => chrome.tabs.create({ url }));
  });
}

// ── Render project list (projects tab) ────────────────────────────────────────

function renderProjectList() {
  const wrap = document.getElementById('projectListWrap');
  if (S.projects.length === 0) {
    wrap.innerHTML = `<div class="empty-row">
      <i class="ti ti-folder-off"></i>
      No projects yet — create one above
    </div>`;
    return;
  }
  // Session counts come from backend but we don't load them per-project here
  // to keep the popup fast. Show project name and a "→" to open.
  wrap.innerHTML = S.projects.map((p) => `
    <div class="proj-row" data-href="http://localhost:3000/projects/${esc(p.id)}">
      <span class="proj-name">${esc(p.name)}</span>
      <span class="proj-chev"><i class="ti ti-chevron-right"></i></span>
    </div>`).join('');

  wrap.querySelectorAll('.proj-row[data-href]').forEach((row) => {
    row.addEventListener('click', () => chrome.tabs.create({ url: row.dataset.href }));
  });
}

// ── Render saved tab ──────────────────────────────────────────────────────────

function renderSaved(query = '') {
  const wrap = document.getElementById('savedListWrap');
  const q = query.trim().toLowerCase();

  let items = S.allContexts;
  if (q) {
    items = items.filter((ctx) => {
      const title   = ctxTitle(ctx).toLowerCase();
      const preview = ctxPreview(ctx).toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }

  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-row">
      <i class="ti ti-inbox-off"></i>
      ${q ? 'No captures match your search' : 'No captures yet'}
    </div>`;
    return;
  }

  // Group by Today / Yesterday / Earlier
  const groups = {};
  for (const ctx of items) {
    const g = dateGroup(ctx.created_at);
    if (!groups[g]) groups[g] = [];
    groups[g].push(ctx);
  }

  const ORDER = ['Today', 'Yesterday', 'Earlier'];
  let html = '';
  for (const grp of ORDER) {
    if (!groups[grp]) continue;
    html += `<div class="date-group"><div class="date-label">${grp}</div>`;
    for (const ctx of groups[grp]) {
      const plat    = ctxPlatform(ctx);
      const title   = ctxTitle(ctx);
      const preview = ctxPreview(ctx);
      const projName = S.projectMap[ctx.session_id] ?? '';
      html += `
        <div class="ctx-card" data-url="${esc(ctx.raw_content?.url ?? '')}">
          <div class="ctx-card-top">
            ${badgeHtml(plat)}
            <span class="ctx-time">${timeAgo(ctx.created_at)}</span>
          </div>
          <div class="ctx-title" style="margin-top:4px">${esc(title)}</div>
          ${preview ? `<div class="ctx-preview">${esc(preview)}</div>` : ''}
          ${projName ? `<span class="ctx-project-tag">${esc(projName)}</span>` : ''}
        </div>`;
    }
    html += `</div>`;
  }
  wrap.innerHTML = html;

  wrap.querySelectorAll('.ctx-card[data-url]').forEach((card) => {
    const url = card.dataset.url;
    if (url) card.addEventListener('click', () => chrome.tabs.create({ url }));
  });
}

// ── Select project ────────────────────────────────────────────────────────────

async function selectProject(id) {
  S.selectedProjectId = id;
  await storageSet({ [STORAGE.selectedProject]: id });
  renderPills();
  setCaptureBtn(deriveCaptureState());
  // Load contexts for this project
  document.getElementById('recentCaptures').innerHTML =
    `<div class="skel-card"></div><div class="skel-card" style="height:56px"></div>`;
  try {
    S.captureContexts = await fetchContexts(id, 5);
  } catch {
    S.captureContexts = [];
  }
  renderRecentCaptures();
}

// ── Capture action ────────────────────────────────────────────────────────────

async function doCapture() {
  if (S.capturing) return;
  if (!S.activeTabInfo || !S.selectedProjectId || !S.online) return;

  S.capturing = true;
  setCaptureBtn('loading');

  const { url, title, platform } = S.activeTabInfo;
  const projectId = S.selectedProjectId;

  try {
    // 1. Find or create a session for this project+platform
    let sessionId;
    const sessions = await fetchSessions(projectId);
    const existing = sessions.find((s) => s.source_platform === platform);
    if (existing) {
      sessionId = existing.id;
    } else {
      const created = await createSession(projectId, platform);
      sessionId = created.id;
    }

    // 2. Capture context
    const ctx = await doApiCapture(sessionId, platform, url, title);

    // 3. Success feedback
    setCaptureBtn('success');

    // 4. Refresh recent captures
    try {
      S.captureContexts = await fetchContexts(projectId, 5);
    } catch {
      // Non-fatal
    }
    renderRecentCaptures();

    // 5. Reset button after 2 s
    setTimeout(() => {
      setCaptureBtn(deriveCaptureState());
    }, 2000);

  } catch (err) {
    console.error('[Popup] Capture failed:', err);
    setCaptureBtn('error');
    setTimeout(() => setCaptureBtn(deriveCaptureState()), 3000);
  } finally {
    S.capturing = false;
  }
}

// ── Create project ────────────────────────────────────────────────────────────

async function createProject(name, formId) {
  const n = name.trim();
  if (!n) return;
  try {
    const project = await apiCreateProject(n);
    S.projects.unshift(project);
    S.projectMap[project.id] = project.name;
    await selectProject(project.id);
    renderProjectList();
    // Hide form
    document.getElementById(formId).classList.add('hidden');
    document.getElementById(formId.replace('inlineForm', 'newProjInput') + (formId.endsWith('1') ? '1' : '2')).value = '';
  } catch (err) {
    console.error('[Popup] Create project failed:', err);
    alert('Failed to create project. Check that the backend is running.');
  }
}

// ── Switch tab ────────────────────────────────────────────────────────────────

async function switchTab(name) {
  if (S.currentTab === name) return;
  S.currentTab = name;
  await storageSet({ [STORAGE.activeTab]: name });

  // Update tab bar
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  // Update panels
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${name}`);
  });
  // Update footer active state
  const footerMap = { capture: null, projects: null, saved: 'footerSearch' };

  // Lazy-load data for the tab
  if (name === 'saved' && S.allContexts.length === 0) {
    await loadSavedData();
  }
  if (name === 'projects' && S.projects.length > 0) {
    renderProjectList();
  }
}

// ── Load saved tab data ───────────────────────────────────────────────────────

async function loadSavedData() {
  document.getElementById('savedListWrap').innerHTML = `<div class="loading-row">Loading…</div>`;
  try {
    // Fetch up to 5 contexts per project, merge, sort
    const fetches = S.projects.map((p) =>
      fetchContexts(p.id, 5)
        .then((items) => items.map((ctx) => ({ ...ctx, _projectId: p.id })))
        .catch(() => [])
    );
    const arrays  = await Promise.all(fetches);
    const all     = arrays.flat().sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
    S.allContexts = all;
    renderSaved(document.getElementById('searchInput').value);
  } catch {
    S.allContexts = [];
    renderSaved();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Load persisted UI state
  const stored = await storageGet([STORAGE.selectedProject, STORAGE.activeTab]);
  if (stored[STORAGE.selectedProject]) {
    S.selectedProjectId = stored[STORAGE.selectedProject];
  }
  // Do NOT pre-set S.currentTab here — switchTab() has an early-return guard
  // "if (S.currentTab === name) return" that would skip the DOM update if we
  // pre-set it to the stored value before calling switchTab().
  const storedTab = stored[STORAGE.activeTab];
  if (storedTab && storedTab !== 'capture') {
    await switchTab(storedTab);
  }

  // 2. Detect current tab (fast, local)
  S.activeTabInfo = await detectActiveTab();
  renderDetectBanner(S.activeTabInfo);

  // 3. Check backend health
  S.online = await healthCheck();
  setStatusDot(S.online);
  setOfflineBanner(!S.online);

  // 4. Set capture button initial state
  setCaptureBtn(deriveCaptureState());

  // 5. Load projects (needed by all tabs)
  try {
    S.projects = S.online ? await fetchProjects() : [];
    for (const p of S.projects) S.projectMap[p.id] = p.name;

    // Validate stored selection
    if (S.selectedProjectId && !S.projects.find((p) => p.id === S.selectedProjectId)) {
      S.selectedProjectId = S.projects[0]?.id ?? null;
      if (S.selectedProjectId) await storageSet({ [STORAGE.selectedProject]: S.selectedProjectId });
    }
    if (!S.selectedProjectId && S.projects.length > 0) {
      S.selectedProjectId = S.projects[0].id;
      await storageSet({ [STORAGE.selectedProject]: S.selectedProjectId });
    }

    renderPills();
    setCaptureBtn(deriveCaptureState());
    renderProjectList();

    // Load recent captures for selected project
    if (S.selectedProjectId && S.online) {
      try {
        S.captureContexts = await fetchContexts(S.selectedProjectId, 5);
      } catch {
        S.captureContexts = [];
      }
    }
    renderRecentCaptures();

    // If starting on saved tab, load its data
    if (S.currentTab === 'saved') {
      await loadSavedData();
    }
  } catch (err) {
    console.error('[Popup] Init data load failed:', err);
    renderRecentCaptures();
    renderProjectList();
  }

  // 6. Wire events
  bindEvents();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Capture button
  document.getElementById('captureBtn').addEventListener('click', doCapture);

  // ── Capture tab: new project inline form (form 1) ──
  document.getElementById('newProjLink').addEventListener('click', () => {
    document.getElementById('inlineForm1').classList.remove('hidden');
    document.getElementById('newProjInput1').focus();
  });
  document.getElementById('newProjCancel1').addEventListener('click', () => {
    document.getElementById('inlineForm1').classList.add('hidden');
    document.getElementById('newProjInput1').value = '';
  });
  document.getElementById('newProjConfirm1').addEventListener('click', () => {
    createProject(document.getElementById('newProjInput1').value, 'inlineForm1');
  });
  document.getElementById('newProjInput1').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createProject(e.target.value, 'inlineForm1');
    if (e.key === 'Escape') document.getElementById('newProjCancel1').click();
  });

  // ── Projects tab: new project inline form (form 2) ──
  document.getElementById('newProjBtn2').addEventListener('click', () => {
    document.getElementById('inlineForm2').classList.remove('hidden');
    document.getElementById('newProjInput2').focus();
  });
  document.getElementById('newProjCancel2').addEventListener('click', () => {
    document.getElementById('inlineForm2').classList.add('hidden');
    document.getElementById('newProjInput2').value = '';
  });
  document.getElementById('newProjConfirm2').addEventListener('click', () => {
    createProject(document.getElementById('newProjInput2').value, 'inlineForm2');
  });
  document.getElementById('newProjInput2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createProject(e.target.value, 'inlineForm2');
    if (e.key === 'Escape') document.getElementById('newProjCancel2').click();
  });

  // ── Saved tab: search ──
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderSaved(e.target.value);
  });

  // ── Footer buttons ──
  document.getElementById('footerDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });
  document.getElementById('footerSearch').addEventListener('click', async () => {
    await switchTab('saved');
    document.getElementById('searchInput').focus();
  });
  document.getElementById('footerSettings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000/settings' });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
