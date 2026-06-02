/**
 * background.ts — Manifest V3 service worker entry point.
 *
 * Responsibilities:
 *  - Handle CREATE_PROVIDER_SESSION messages from the frontend
 *  - Route webNavigation events to the active session's URL resolver
 *  - Route content-script CS_UI_READY / CS_AUTH_REQUIRED to EventBus
 *  - Enforce session timeouts via chrome.alarms (backup for in-SW setTimeout)
 *  - Recover non-terminal sessions on SW restart
 */

import { SessionStore }        from './storage/SessionStore';
import { EventBus }            from './core/EventBus';
import { TabManager }          from './core/TabManager';
import { SessionOrchestrator } from './core/SessionOrchestrator';
import { CaptureQueue }        from './core/CaptureQueue';
import { BackendClient }       from './api/BackendClient';
import { ProviderRegistry }    from './providers/ProviderRegistry';
import type { ExternalRequest, ContentScriptMessage, CaptureContextRequest, ExtractConversationResult } from './types/messages';
import type { ProviderSession, FailureReason } from './types/session';

// ── Singletons ────────────────────────────────────────────────────────────────

const store        = new SessionStore();
const bus          = new EventBus();
const tabs         = new TabManager(store);
const api          = new BackendClient();
const providers    = new ProviderRegistry();
const orch         = new SessionOrchestrator(bus, store, tabs, api, providers);
const captureQueue = new CaptureQueue(api);

// ── SW startup / recovery ─────────────────────────────────────────────────────

void orch.restore();
chrome.runtime.onInstalled.addListener(() => void orch.restore());
chrome.runtime.onStartup.addListener(() => {
  void orch.restore();
  // Flush any captures that were queued but not sent before SW was killed
  void captureQueue.purgeExpired().then(() => captureQueue.flush());
});

// ── External messages (Frontend → Extension) ──────────────────────────────────

chrome.runtime.onMessageExternal.addListener(
  (message: ExternalRequest, _sender, sendResponse) => {
    if (message.type !== 'CREATE_PROVIDER_SESSION') {
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
    }

    const session: ProviderSession = {
      sessionId:        message.sessionId,
      projectId:        message.projectId,
      platform:         message.platform,
      bootstrapMessage: message.bootstrapMessage,
      state:            'pending',
      tabId:            null,
      linkedUrl:        null,
      createdAt:        Date.now(),
    };

    orch.start(session)
      .then(() => sendResponse({ success: true }))
      .catch((err: unknown) => {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      });

    return true; // keep sendResponse channel open for async response
  },
);

// ── Popup → Background: context capture ──────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: CaptureContextRequest, _sender, sendResponse) => {
    if (message.type !== 'CAPTURE_CONTEXT_REQUEST') return;

    handleCaptureRequest(message)
      .then(sendResponse)
      .catch((err: unknown) => sendResponse({
        type: 'CAPTURE_CONTEXT_RESULT', ok: false,
        error: 'UPLOAD_FAILED',
        detail: err instanceof Error ? err.message : String(err),
      }));

    return true; // keep response channel open
  },
);

async function handleCaptureRequest(msg: CaptureContextRequest): Promise<unknown> {
  const { projectId, tabId, platform, idempotencyKey } = msg;

  // 1. Acquire per-tab lock (prevent double-click race)
  const lockKey = `cw_cap_lock_${tabId}`;
  const existing = await chrome.storage.local.get(lockKey);
  if (existing[lockKey]) {
    return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'LOCK_HELD', detail: 'Capture in progress.' };
  }
  await chrome.storage.local.set({ [lockKey]: Date.now() });

  try {
    // 2. Validate tab is alive and URL is correct platform
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url) {
      return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'TAB_DEAD', detail: 'Tab no longer exists.' };
    }

    // 3. Extract conversation from content script
    let extract: ExtractConversationResult;
    try {
      extract = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' }) as ExtractConversationResult;
    } catch {
      return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'EXTRACT_FAILED', detail: 'Content script unreachable.' };
    }

    if (!extract.ok) {
      return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'EXTRACT_FAILED', detail: extract.detail };
    }

    // 4. Payload size guard (1 MB)
    const payload = {
      idempotency_key: idempotencyKey,
      platform,
      chat_url:    tab.url,
      captured_at: new Date().toISOString(),
      title:       extract.payload.title,
      messages:    extract.payload.messages,
      metadata:    { ...extract.payload.metadata, tabId, windowId: tab.windowId ?? 0 },
    };
    if (JSON.stringify(payload).length > 1_000_000) {
      return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'UPLOAD_FAILED', detail: 'Payload exceeds 1 MB.' };
    }

    // 5. Enqueue + upload (queue handles retries)
    await captureQueue.enqueue(projectId, payload);
    await captureQueue.flush();

    const entry = await captureQueue.getEntry(idempotencyKey);
    if (!entry?.result) {
      return { type: 'CAPTURE_CONTEXT_RESULT', ok: false, error: 'UPLOAD_FAILED', detail: entry?.error ?? 'Upload failed.' };
    }

    return {
      type:         'CAPTURE_CONTEXT_RESULT',
      ok:           true,
      contextId:    entry.result.context_id,
      sessionId:    entry.result.session_id,
      title:        entry.result.title,
      messageCount: entry.result.messages_count,
      platform,
      capturedAt:   entry.result.captured_at,
    };
  } finally {
    await chrome.storage.local.remove(lockKey);
  }
}

// ── Content-script messages (CS → Background) ────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ContentScriptMessage, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;

    const sessionId = tabs.getSessionId(tabId);
    if (!sessionId) return;

    if (message.type === 'CS_UI_READY') {
      bus.emit({ type: 'UI_READY', sessionId });
    } else if (message.type === 'CS_AUTH_REQUIRED') {
      bus.emit({ type: 'SESSION_FAILED', sessionId, reason: 'auth_required' });
    }
  },
);

// ── webNavigation — conversation URL capture ──────────────────────────────────

function handleNavigation(
  details: chrome.webNavigation.WebNavigationUrlCallbackDetails,
): void {
  const { tabId, url, frameId } = details as typeof details & { frameId?: number };
  if (frameId !== undefined && frameId !== 0) return; // main frame only

  const sessionId = tabs.getSessionId(tabId);
  if (!sessionId) return;

  if (providers.isTrackedUrl(url)) {
    bus.emit({ type: 'URL_DETECTED', sessionId, url });
  }
}

chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
chrome.webNavigation.onCompleted.addListener(handleNavigation);

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  void orch.notifyTabClosed(tabId);
});

// ── Alarm handler — backup timeout enforcement ────────────────────────────────

const TIMEOUT_REASON_MAP: Record<string, FailureReason> = {
  creating_tab:        'backend_error',
  waiting_for_ui:      'ui_timeout',
  injecting_bootstrap: 'bootstrap_failed',
  waiting_for_url:     'url_timeout',
  linking:             'backend_error',
};

chrome.alarms.onAlarm.addListener((alarm) => {
  const match = alarm.name.match(/^timeout:([^:]+):(.+)$/);
  if (!match) return;
  const [, sessionId, rawState] = match;
  const reason = TIMEOUT_REASON_MAP[rawState] ?? 'backend_error';
  void orch.notifyAlarmTimeout(sessionId, reason);
});
