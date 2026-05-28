/**
 * popup.js — Context Workspace Popup Controller (redesigned)
 * ============================================================
 * Premium dark UI. Reads from two storage sources:
 *   1. store/state.js    → project identity, capture history
 *   2. active_sessions   → live FSM session state (from SessionStore.ts)
 */

import { store } from './store/state.js';
import { api }   from './services/api.js';

// ── Platform metadata ──────────────────────────────────────────────────────

const PLATFORMS = {
  chatgpt:     { label: 'ChatGPT',     emoji: '🟢', cssVar: '--chatgpt',     cssBg: '--chatgpt-bg' },
  claude:      { label: 'Claude',      emoji: '🟠', cssVar: '--claude',      cssBg: '--claude-bg' },
  gemini:      { label: 'Gemini',      emoji: '🔵', cssVar: '--gemini',      cssBg: '--gemini-bg' },
  perplexity:  { label: 'Perplexity', emoji: '🩵', cssVar: '--perplexity',  cssBg: '--perplexity-bg' },
};

// Platform emoji icons (inline SVG-free approach)
const PLATFORM_ICONS = {
  chatgpt:    '✦',
  claude:     '◈',
  gemini:     '◇',
  perplexity: '⋄',
};

const STATE_LABELS = {
  pending:              'pending',
  creating_tab:         'opening…',
  waiting_for_ui:       'loading UI…',
  injecting_bootstrap:  'injecting…',
  waiting_for_url:      'waiting…',
  linking:              'linking…',
  completed:            'connected',
  failed:               'failed',
};

const TERMINAL = new Set(['completed', 'failed']);

// ── Utilities ──────────────────────────────────────────────────────────────

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
  return `${Math.floor(h / 24)}d ago`;
}

/** Read live FSM sessions from chrome.storage.local */
async function getActiveSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get('active_sessions', (result) => {
      const raw = result['active_sessions'];
      if (!raw || typeof raw !== 'object') return resolve([]);
      resolve(Object.values(raw));
    });
  });
}

function stateClass(state) {
  if (state === 'completed') return 'completed';
  if (state === 'failed')    return 'failed';
  if (state === 'pending')   return 'pending';
  return 'active';
}

// ── Component builders ─────────────────────────────────────────────────────

function buildProjectCard(project, sessions) {
  const activeCount = sessions.filter(s => !TERMINAL.has(s.state)).length;
  const meta = sessions.length
    ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} · ${activeCount} active`
    : 'no sessions yet';

  return `
    <button class="project-card" id="projectCardBtn">
      <div class="project-dot"></div>
      <div class="project-info">
        <div class="project-name">${esc(project.name)}</div>
        <div class="project-meta">${esc(meta)}</div>
      </div>
      <span class="project-arrow">›</span>
    </button>`;
}

function buildPlatformGrid(sessions) {
  return `
    <div class="platform-grid">
      ${['chatgpt', 'claude', 'gemini', 'perplexity'].map((p, i) => {
        const meta   = PLATFORMS[p];
        const pSessions = sessions.filter(s => s.platform === p);
        const active = pSessions.filter(s => !TERMINAL.has(s.state));
        const linked = pSessions.filter(s => s.state === 'completed');
        const hasAny = pSessions.length > 0;

        let statusDotClass = '';
        let statusText = 'no tabs';

        if (active.length) {
          statusDotClass = 'pending';
          statusText = STATE_LABELS[active[0].state] ?? 'active';
        } else if (linked.length) {
          statusDotClass = 'active';
          statusText = `${linked.length} linked`;
        }

        const extraStyle = hasAny
          ? `style="--pc-brd: rgba(var(--${p}-rgb, 255,255,255),0.18); --pc-bg: var(${meta.cssBg});"`
          : '';

        const animDelay = `animation-delay:${i * 40}ms`;

        return `
          <button
            class="platform-card${hasAny ? ' has-tabs' : ''}"
            data-platform="${p}"
            ${extraStyle}
            style="${animDelay}"
          >
            <div class="platform-icon-wrap"
              style="color:var(${meta.cssVar}); background: ${hasAny ? `var(${meta.cssBg})` : 'var(--surface-act)'};"
            >${PLATFORM_ICONS[p]}</div>
            <div class="platform-info">
              <div class="platform-name">${meta.label}</div>
              <div class="platform-status-row">
                <span class="pdot ${statusDotClass}"></span>
                <span>${esc(statusText)}</span>
              </div>
            </div>
          </button>`;
      }).join('')}
    </div>`;
}

function buildSessionList(sessions, history) {
  const rows = [];

  // Show in-progress FSM sessions first
  const inProgress = sessions.filter(s => !TERMINAL.has(s.state));
  for (const s of inProgress.slice(0, 3)) {
    const p = PLATFORMS[s.platform];
    const label = STATE_LABELS[s.state] ?? s.state;
    const pipColor = p ? `var(${p.cssVar})` : 'var(--accent)';

    rows.push(`
      <button class="session-row" style="animation-delay:${rows.length * 40}ms">
        <div class="session-pip" style="background:${pipColor}"></div>
        <div class="session-body">
          <div class="session-title">${p?.label ?? s.platform} session</div>
          <div class="session-sub">${esc(label)}</div>
        </div>
        <span class="state-badge ${stateClass(s.state)}">
          ${s.state === 'completed' ? '✓' : `<span class="state-spinner"></span>`}
          ${esc(label)}
        </span>
      </button>`);
  }

  // Fill remaining slots with capture history
  const remaining = Math.max(0, 3 - rows.length);
  for (const cap of history.slice(0, remaining)) {
    const p = PLATFORMS[cap.platform];
    const pipColor = p ? `var(${p.cssVar})` : 'var(--accent)';
    rows.push(`
      <button class="session-row" style="animation-delay:${rows.length * 40}ms">
        <div class="session-pip" style="background:${pipColor}"></div>
        <div class="session-body">
          <div class="session-title">${p?.label ?? cap.platform}</div>
          <div class="session-sub">${cap.messageCount ?? 0} messages</div>
        </div>
        <span class="session-time">${timeAgo(cap.timestamp)}</span>
      </button>`);
  }

  return rows.length
    ? `<div class="session-list">${rows.join('')}</div>`
    : `<p class="no-data">no recent sessions</p>`;
}

function buildEmptyState() {
  return `
    <div class="empty">
      <div class="empty-icon">◈</div>
      <p class="empty-title">No active project</p>
      <p class="empty-desc">Create a project in Context Workspace to start managing your AI sessions.</p>
      <button class="cta-btn" id="emptyOpenBtn">Open Workspace →</button>
    </div>`;
}

// ── Render ─────────────────────────────────────────────────────────────────

async function render() {
  const [state, activeSessions] = await Promise.all([
    store.get(),
    getActiveSessions(),
  ]);

  const el = document.getElementById('mainContent');

  if (!state.activeProject) {
    el.innerHTML = buildEmptyState();
    document.getElementById('emptyOpenBtn')
      ?.addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:3000/projects' }));
    return;
  }

  const allSessions = [...activeSessions, ...state.sessions];

  el.innerHTML = `
    <div class="section">
      ${buildProjectCard(state.activeProject, activeSessions)}
    </div>

    <div class="section" style="padding-top:0">
      <div class="section-label">Platforms</div>
      ${buildPlatformGrid(activeSessions)}
    </div>

    <div class="section" style="padding-top:0">
      <div class="section-label">Sessions</div>
      ${buildSessionList(activeSessions, state.captureHistory)}
    </div>`;

  // Wire project card → open app
  document.getElementById('projectCardBtn')
    ?.addEventListener('click', () =>
      chrome.tabs.create({ url: `http://localhost:3000/projects/${state.activeProject.id}` }));

  // Wire platform cards → open tab
  el.querySelectorAll('.platform-card[data-platform]').forEach((btn) => {
    btn.addEventListener('click', () => openPlatform(btn.dataset.platform));
  });
}

// ── Backend status ─────────────────────────────────────────────────────────

async function checkBackend() {
  const capsule = document.getElementById('statusCapsule');
  const label   = document.getElementById('statusLabel');
  const ok = await api.health();
  capsule.className = `status-capsule ${ok ? 'online' : 'offline'}`;
  label.textContent = ok ? 'connected' : 'offline';
}

// ── Actions ────────────────────────────────────────────────────────────────

function openPlatform(platform) {
  chrome.runtime.sendMessage({ action: 'OPEN_PLATFORM_TAB', platform }, () => {
    if (chrome.runtime.lastError) return;
    setTimeout(render, 500);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await render();
  checkBackend();

  document.getElementById('openWorkspaceBtn')
    ?.addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:3000' }));

  document.getElementById('newProjectBtn')
    ?.addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:3000/projects/new' }));

  // Refresh if storage changes while popup is open
  chrome.storage.onChanged.addListener(() => render());
});
