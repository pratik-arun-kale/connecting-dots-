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
import { BackendClient }       from './api/BackendClient';
import { ProviderRegistry }    from './providers/ProviderRegistry';
import type { ExternalRequest, ContentScriptMessage } from './types/messages';
import type { ProviderSession, FailureReason } from './types/session';

// ── Singletons ────────────────────────────────────────────────────────────────

const store     = new SessionStore();
const bus       = new EventBus();
const tabs      = new TabManager(store);
const api       = new BackendClient();
const providers = new ProviderRegistry();
const orch      = new SessionOrchestrator(bus, store, tabs, api, providers);

// ── SW startup / recovery ─────────────────────────────────────────────────────

void orch.restore();
chrome.runtime.onInstalled.addListener(() => void orch.restore());
chrome.runtime.onStartup.addListener(() => void orch.restore());

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
