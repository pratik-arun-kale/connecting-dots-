/**
 * src/background.ts — Context Workspace Service Worker
 * ======================================================
 * Compiled by esbuild into background.js (ESM bundle).
 *
 * Responsibilities:
 *   § 0  URL tracking       — detect conversation navigation via webNavigation
 *   § 1  Sync retry         — alarm-driven SyncQueue flush
 *   § 2  External messages  — handle frontend OPEN_PROJECT_SESSIONS
 *   § 3  Internal messages  — handle popup and content-script commands
 *   § 4  Legacy capture     — full DOM capture (original flow, kept intact)
 *   § 5  Lifecycle          — install/update hooks
 */

import { api } from './api.js';
import { store } from './state.js';
import { TabRegistry } from './TabRegistry.js';
import { SessionLinker } from './SessionLinker.js';

/** Canonical home URL for each platform — used when opening new tabs. */
const PLATFORM_URLS: Record<string, string> = {
  chatgpt: 'https://chat.openai.com/',
  claude:  'https://claude.ai/',
  gemini:  'https://gemini.google.com/',
};

// ── § 0  URL TRACKING ─────────────────────────────────────────────────────────

const NAV_FILTER: chrome.webNavigation.WebNavigationEventFilter = {
  url: [
    { hostEquals: 'chat.openai.com' },
    { hostEquals: 'claude.ai' },
    { hostEquals: 'gemini.google.com' },
  ],
};

// SPA navigation (pushState / replaceState — the common case on all three platforms)
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => {
  void SessionLinker.onTabUrlChange(tabId, url);
}, NAV_FILTER);

// Full-page navigation (direct URL, tab reload)
chrome.webNavigation.onCompleted.addListener(({ tabId, url, frameId }) => {
  if (frameId !== 0) return; // main frame only
  void SessionLinker.onTabUrlChange(tabId, url);
}, NAV_FILTER);

// Clean up TabRegistry when a tracked tab is closed.
chrome.tabs.onRemoved.addListener((tabId) => {
  void TabRegistry.remove(tabId);
});

// ── § 1  SYNC RETRY ───────────────────────────────────────────────────────────

const ALARM_NAME = 'sync-queue-retry';

chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void SessionLinker.processSyncQueue();
  }
});

// ── § 2  EXTERNAL MESSAGES (from Next.js frontend) ───────────────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'OPEN_PROJECT_SESSIONS') return false;

  const { projectId, sessions } = (message.payload ?? {}) as {
    projectId?: string;
    sessions?: Array<{ sessionId: string; platform: string }>;
  };

  if (!projectId || !Array.isArray(sessions)) {
    sendResponse({ success: false, error: 'Invalid payload' });
    return false;
  }

  void (async () => {
    try {
      // Persist skeleton state immediately so popup renders something.
      await store.set({
        activeProject: { id: projectId, name: 'Loading…' },
        sessions: sessions.map((s) => ({ id: s.sessionId, source_platform: s.platform })),
      });

      // Enrich project name from backend (non-fatal if backend is down).
      try {
        const project = await api.getProject(projectId);
        await store.set({ activeProject: { id: projectId, name: project.name } });
      } catch (err) {
        console.warn('[Workspace] Could not fetch project name:', err);
      }

      // Open a tab per platform and register each in TabRegistry.
      for (const { sessionId, platform } of sessions) {
        const url = PLATFORM_URLS[platform];
        if (!url) {
          console.warn('[Workspace] Unknown platform:', platform);
          continue;
        }
        const tab = await chrome.tabs.create({ url, active: false });
        if (tab.id) {
          await TabRegistry.set({
            tabId: tab.id,
            sessionId,
            projectId,
            platform,
            linkedUrl: null,
            syncStatus: 'pending',
          });
          console.log('[Workspace] Tab', tab.id, '→', platform, '→ session', sessionId);
        }
      }

      sendResponse({ success: true });
    } catch (err) {
      console.error('[Workspace] OPEN_PROJECT_SESSIONS failed:', err);
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();

  return true; // keep the channel open for the async sendResponse
});

// ── § 3  INTERNAL MESSAGES (popup + content scripts) ─────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = (message as { action?: string }).action;

  // Content script: which session does this tab belong to?
  if (action === 'GET_TAB_MAPPING') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ mapping: null }); return false; }
    void TabRegistry.get(tabId).then((entry) => sendResponse({ mapping: entry }));
    return true;
  }

  // Popup: open a platform tab for the active project's session.
  if (action === 'OPEN_PLATFORM_TAB') {
    const { platform } = message as { platform: string };
    const url = PLATFORM_URLS[platform];
    if (!url) { sendResponse({ success: false, error: 'Unknown platform' }); return false; }

    void (async () => {
      try {
        const state = await store.get();
        const session = state.sessions.find((s) => s.source_platform === platform);
        const tab = await chrome.tabs.create({ url, active: true });

        if (tab.id && session && state.activeProject) {
          await TabRegistry.set({
            tabId: tab.id,
            sessionId: session.id,
            projectId: state.activeProject.id,
            platform,
            linkedUrl: null,
            syncStatus: 'pending',
          });
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }

  // Content script: record a completed context capture in history.
  if (action === 'RECORD_CAPTURE') {
    const { sessionId, platform, url, messageCount } = (message.data ?? {}) as {
      sessionId: string; platform: string; url: string; messageCount: number;
    };
    void (async () => {
      try {
        const state = await store.get();
        const entry = { sessionId, platform, url, messageCount, timestamp: new Date().toISOString() };
        await store.set({ captureHistory: [entry, ...state.captureHistory].slice(0, 50) });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }

  // Legacy: full DOM capture (original flow).
  if (action !== 'CAPTURE_PAGE') return false;

  void (async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab found.');

      const tabUrl = activeTab.url ?? '';
      if (/^(chrome|chrome-extension|about):/.test(tabUrl)) {
        throw new Error('Cannot capture content from browser internal pages.');
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js'],
      });
      const payload = results?.[0]?.result as Record<string, unknown> | undefined;
      if (!payload || typeof payload !== 'object') throw new Error('Content script returned unexpected value.');

      await _saveCapture(payload);

      try {
        const mod = await import(chrome.runtime.getURL('pipeline/index.js')) as { processCapture?: (p: unknown) => unknown };
        if (typeof mod.processCapture === 'function') {
          await _saveProcessedCapture(mod.processCapture(payload));
        }
      } catch (procErr) {
        console.warn('[Workspace] Processing pipeline failed:', procErr);
      }

      sendResponse({ success: true, title: payload['title'], url: payload['url'] });
    } catch (err) {
      console.error('[Workspace] CAPTURE_PAGE error:', err);
      sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error.' });
    }
  })();

  return true;
});

// ── § 4  LEGACY CAPTURE STORAGE ──────────────────────────────────────────────

const PAGE_CAPTURES_KEY = 'pageCaptures';
const MAX_CAPTURES = 50;

async function _saveCapture(record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(PAGE_CAPTURES_KEY, (result) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const existing = (result[PAGE_CAPTURES_KEY] as unknown[]) ?? [];
      chrome.storage.local.set({ [PAGE_CAPTURES_KEY]: [record, ...existing].slice(0, MAX_CAPTURES) }, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
  });
}

async function _saveProcessedCapture(record: unknown): Promise<void> {
  const KEY = 'pageCapturesProcessed';
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(KEY, (result) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const existing = (result[KEY] as unknown[]) ?? [];
      chrome.storage.local.set({ [KEY]: [record, ...existing].slice(0, MAX_CAPTURES) }, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
  });
}

// ── § 5  LIFECYCLE ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(PAGE_CAPTURES_KEY, (result) => {
    if (!result[PAGE_CAPTURES_KEY]) {
      chrome.storage.local.set({ [PAGE_CAPTURES_KEY]: [] });
    }
  });
  // Restore TabRegistry cache and flush any pending sync entries from the previous SW lifetime.
  void TabRegistry.restore().then(() => SessionLinker.processSyncQueue());
  console.log('[Workspace] Extension installed/updated.');
});
