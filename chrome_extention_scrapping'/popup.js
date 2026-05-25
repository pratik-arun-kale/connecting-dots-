/**
 * popup.js — Context Workspace Popup Controller
 * ===============================================
 * ES module. Reads workspace state and renders the popup UI.
 * Communicates with background.js for tab management.
 */

import { store } from './store/state.js';
import { api }   from './services/api.js';

// ── Platform metadata ──────────────────────────────────────────────────────

const PLATFORMS = {
  chatgpt: { label: 'ChatGPT', color: '#10a37f' },
  claude:  { label: 'Claude',  color: '#d4a574' },
  gemini:  { label: 'Gemini',  color: '#4285f4' },
};

// ── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Renderers ──────────────────────────────────────────────────────────────

function renderProject(state) {
  const el = document.getElementById('projectBody');

  if (!state.activeProject) {
    document.getElementById('platformsSection').hidden = true;
    document.getElementById('historySection').hidden   = true;
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-msg">No active project</div>
        <div class="empty-hint">Create a project in Context Workspace to initialize the extension.</div>
        <button id="openAppBtn" class="link-btn">Open Context Workspace →</button>
      </div>`;
    document.getElementById('openAppBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://localhost:3000/projects' });
    });
    return;
  }

  document.getElementById('platformsSection').hidden = false;
  document.getElementById('historySection').hidden   = false;

  el.innerHTML = `
    <div class="project-row">
      <span class="project-name" title="${esc(state.activeProject.name)}">${esc(state.activeProject.name)}</span>
      <span class="badge">${state.sessions.length} session${state.sessions.length !== 1 ? 's' : ''}</span>
    </div>`;
}

function renderPlatforms(state) {
  const el = document.getElementById('platformBody');

  if (!state.sessions.length) {
    el.innerHTML = '<div class="no-data">No sessions for this project.</div>';
    return;
  }

  el.innerHTML = state.sessions.map((session) => {
    const p      = PLATFORMS[session.source_platform];
    if (!p) return '';
    const hasTab = Object.values(state.tabMappings).some(m => m.sessionId === session.id);

    return `
      <div class="platform-row">
        <span class="dot" style="background:${p.color}"></span>
        <span class="platform-label">${p.label}</span>
        <span class="tab-status ${hasTab ? 'open' : ''}">${hasTab ? '● tab open' : '○ no tab'}</span>
        <button class="open-tab-btn" data-platform="${esc(session.source_platform)}">Open</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.open-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlatform(btn.dataset.platform));
  });
}

function renderHistory(state) {
  const el = document.getElementById('historyBody');

  if (!state.captureHistory.length) {
    el.innerHTML = '<div class="no-data">No saves yet — use "Save to Project" on a ChatGPT page.</div>';
    return;
  }

  el.innerHTML = state.captureHistory.slice(0, 5).map((cap) => {
    const p = PLATFORMS[cap.platform];
    return `
      <div class="capture-row">
        <span class="dot" style="background:${p?.color || '#666'}"></span>
        <div class="capture-info">
          <span class="capture-platform">${p?.label || cap.platform}</span>
          <span class="capture-meta">${cap.messageCount} msg · ${timeAgo(cap.timestamp)}</span>
        </div>
      </div>`;
  }).join('');
}

async function render() {
  const state = await store.get();
  renderProject(state);
  if (state.activeProject) {
    renderPlatforms(state);
    renderHistory(state);
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

function openPlatform(platform) {
  chrome.runtime.sendMessage({ action: 'OPEN_PLATFORM_TAB', platform }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[Popup] Could not open tab:', chrome.runtime.lastError.message);
      return;
    }
    setTimeout(render, 400);
  });
}

async function checkBackend() {
  const el = document.getElementById('backendStatus');
  const ok = await api.health();
  el.textContent = ok ? '● backend connected' : '○ backend offline';
  el.className   = `backend-status ${ok ? 'ok' : 'off'}`;
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await render();
  checkBackend(); // async, updates status indicator when resolved

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm('Clear local workspace state?\n\nYour backend data (projects, sessions, contexts) is not affected.')) return;
    await store.clear();
    render();
  });
});
