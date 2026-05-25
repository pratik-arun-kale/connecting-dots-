// src/storage/SessionStore.ts
var KEY = "active_sessions";
var SessionStore = class {
  async getAll() {
    const data = await chrome.storage.local.get(KEY);
    const raw = data[KEY];
    return new Map(Object.entries(raw ?? {}));
  }
  async get(sessionId) {
    const all = await this.getAll();
    return all.get(sessionId);
  }
  async set(session) {
    const all = await this.getAll();
    all.set(session.sessionId, session);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
  }
  async update(sessionId, patch) {
    const all = await this.getAll();
    const existing = all.get(sessionId);
    if (!existing) throw new Error(`Session ${sessionId} not in store`);
    const updated = { ...existing, ...patch };
    all.set(sessionId, updated);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
    return updated;
  }
  async remove(sessionId) {
    const all = await this.getAll();
    all.delete(sessionId);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
  }
};

// src/core/EventBus.ts
var EventBus = class {
  _handlers = /* @__PURE__ */ new Map();
  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, /* @__PURE__ */ new Set());
    this._handlers.get(type).add(handler);
  }
  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }
  emit(event) {
    const set = this._handlers.get(event.type);
    if (!set) return;
    for (const h of set) void h(event);
  }
};

// src/core/TabManager.ts
var TabManager = class {
  constructor(store2) {
    this.store = store2;
  }
  _tabToSession = /* @__PURE__ */ new Map();
  _sessionToTab = /* @__PURE__ */ new Map();
  async restore() {
    const sessions = await this.store.getAll();
    for (const [sessionId, session] of sessions) {
      if (session.tabId !== null) {
        this._tabToSession.set(session.tabId, sessionId);
        this._sessionToTab.set(sessionId, session.tabId);
      }
    }
  }
  register(tabId, sessionId) {
    this._tabToSession.set(tabId, sessionId);
    this._sessionToTab.set(sessionId, tabId);
  }
  getSessionId(tabId) {
    return this._tabToSession.get(tabId);
  }
  getTabId(sessionId) {
    return this._sessionToTab.get(sessionId);
  }
  /** Removes the mapping and returns the sessionId that was registered for this tab. */
  unregister(tabId) {
    const sessionId = this._tabToSession.get(tabId);
    if (sessionId !== void 0) {
      this._tabToSession.delete(tabId);
      this._sessionToTab.delete(sessionId);
    }
    return sessionId;
  }
  unregisterSession(sessionId) {
    const tabId = this._sessionToTab.get(sessionId);
    if (tabId !== void 0) {
      this._tabToSession.delete(tabId);
      this._sessionToTab.delete(sessionId);
    }
  }
};

// src/types/session.ts
var STATE_TIMEOUTS = {
  creating_tab: 1e4,
  waiting_for_ui: 45e3,
  injecting_bootstrap: 15e3,
  waiting_for_url: 9e4,
  linking: 15e3
};
var TERMINAL_STATES = /* @__PURE__ */ new Set(["completed", "failed"]);

// src/core/SessionOrchestrator.ts
var SessionTimeoutError = class extends Error {
  constructor(sessionId, reason) {
    super(`Session ${sessionId} timed out: ${reason}`);
    this.sessionId = sessionId;
    this.reason = reason;
  }
};
var SessionOrchestrator = class {
  constructor(bus2, store2, tabs2, api2, providers2) {
    this.bus = bus2;
    this.store = store2;
    this.tabs = tabs2;
    this.api = api2;
    this.providers = providers2;
    this._wireEventBus();
  }
  _inProgress = /* @__PURE__ */ new Set();
  _uiResolvers = /* @__PURE__ */ new Map();
  _urlResolvers = /* @__PURE__ */ new Map();
  _failRejecters = /* @__PURE__ */ new Map();
  _wireEventBus() {
    this.bus.on("UI_READY", ({ sessionId }) => {
      this._uiResolvers.get(sessionId)?.();
      this._uiResolvers.delete(sessionId);
    });
    this.bus.on("URL_DETECTED", ({ sessionId, url }) => {
      this._urlResolvers.get(sessionId)?.(url);
      this._urlResolvers.delete(sessionId);
    });
    this.bus.on("SESSION_FAILED", ({ sessionId, reason }) => {
      this._failRejecters.get(sessionId)?.(new SessionTimeoutError(sessionId, reason));
      this._failRejecters.delete(sessionId);
    });
  }
  /** Called by background.ts to start a new session. */
  async start(session) {
    await this.store.set(session);
    void this._drive(session.sessionId);
  }
  /** Called on SW startup to re-arm all non-terminal sessions. */
  async restore() {
    await this.tabs.restore();
    const sessions = await this.store.getAll();
    for (const [sessionId, session] of sessions) {
      if (!TERMINAL_STATES.has(session.state)) {
        void this._drive(sessionId);
      }
    }
  }
  /** Called by the alarm handler for backup timeout enforcement. */
  async notifyAlarmTimeout(sessionId, reason) {
    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;
    const rejecter = this._failRejecters.get(sessionId);
    if (rejecter) {
      rejecter(new SessionTimeoutError(sessionId, reason));
    } else {
      await this._failSession(sessionId, reason);
    }
  }
  /** Called when chrome.tabs.onRemoved fires for a tracked tab. */
  async notifyTabClosed(tabId) {
    const sessionId = this.tabs.unregister(tabId);
    if (!sessionId) return;
    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;
    const rejecter = this._failRejecters.get(sessionId);
    if (rejecter) {
      rejecter(new SessionTimeoutError(sessionId, "tab_closed"));
    } else {
      await this._failSession(sessionId, "tab_closed");
    }
  }
  async _drive(sessionId) {
    if (this._inProgress.has(sessionId)) return;
    this._inProgress.add(sessionId);
    try {
      let s = await this.store.get(sessionId);
      if (!s || TERMINAL_STATES.has(s.state)) return;
      if (s.state === "pending" || s.state === "creating_tab" && s.tabId === null) {
        s = await this._advance(sessionId, "creating_tab");
        const provider = this.providers.get(s.platform);
        if (!provider) throw new SessionTimeoutError(sessionId, "provider_error");
        const tab = await chrome.tabs.create({ url: provider.homeUrl, active: false });
        const tabId = tab.id;
        this.tabs.register(tabId, sessionId);
        s = await this.store.update(sessionId, { tabId });
      }
      if (s.state === "creating_tab" || s.state === "waiting_for_ui") {
        s = await this._advance(sessionId, "waiting_for_ui");
        this._armAlarm(sessionId, "waiting_for_ui");
        await this._waitForUiReady(sessionId, STATE_TIMEOUTS.waiting_for_ui ?? 45e3);
        this._clearAlarm(sessionId, "waiting_for_ui");
        s = await this._advance(sessionId, "injecting_bootstrap");
      }
      if (s.state === "injecting_bootstrap") {
        this._armAlarm(sessionId, "injecting_bootstrap");
        s = await this.store.get(sessionId);
        if (s.bootstrapMessage && s.tabId !== null) {
          const provider = this.providers.get(s.platform);
          if (provider) {
            try {
              await provider.injectBootstrapMessage(s.tabId, s.bootstrapMessage);
            } catch {
              throw new SessionTimeoutError(sessionId, "bootstrap_failed");
            }
          }
        }
        this._clearAlarm(sessionId, "injecting_bootstrap");
        s = await this._advance(sessionId, "waiting_for_url");
      }
      if (s.state === "waiting_for_url") {
        this._armAlarm(sessionId, "waiting_for_url");
        const url = await this._waitForUrl(sessionId, STATE_TIMEOUTS.waiting_for_url ?? 9e4);
        this._clearAlarm(sessionId, "waiting_for_url");
        s = await this._advance(sessionId, "linking");
        this._armAlarm(sessionId, "linking");
        await this.api.linkSession(sessionId, url);
        this._clearAlarm(sessionId, "linking");
        await this.store.update(sessionId, { state: "completed", linkedUrl: url });
        await this.store.remove(sessionId);
        this._cleanup(sessionId);
      }
    } catch (err) {
      const reason = err instanceof SessionTimeoutError ? err.reason : "backend_error";
      await this._failSession(sessionId, reason);
    } finally {
      this._inProgress.delete(sessionId);
    }
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  async _advance(sessionId, state) {
    await this.api.reportState(sessionId, state);
    return this.store.update(sessionId, { state });
  }
  _waitForUiReady(sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._uiResolvers.delete(sessionId);
        this._failRejecters.delete(sessionId);
        reject(new SessionTimeoutError(sessionId, "ui_timeout"));
      }, timeoutMs);
      this._uiResolvers.set(sessionId, () => {
        clearTimeout(timer);
        this._failRejecters.delete(sessionId);
        resolve();
      });
      this._failRejecters.set(sessionId, (err) => {
        clearTimeout(timer);
        this._uiResolvers.delete(sessionId);
        reject(err);
      });
    });
  }
  _waitForUrl(sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._urlResolvers.delete(sessionId);
        this._failRejecters.delete(sessionId);
        reject(new SessionTimeoutError(sessionId, "url_timeout"));
      }, timeoutMs);
      this._urlResolvers.set(sessionId, (url) => {
        clearTimeout(timer);
        this._failRejecters.delete(sessionId);
        resolve(url);
      });
      this._failRejecters.set(sessionId, (err) => {
        clearTimeout(timer);
        this._urlResolvers.delete(sessionId);
        reject(err);
      });
    });
  }
  async _failSession(sessionId, reason) {
    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;
    try {
      await this.api.failSession(sessionId, reason);
    } catch {
    }
    await this.store.update(sessionId, { state: "failed" });
    await this.store.remove(sessionId);
    this._cleanup(sessionId);
    if (session.tabId !== null) this.tabs.unregister(session.tabId);
  }
  _armAlarm(sessionId, state) {
    const ms = STATE_TIMEOUTS[state];
    if (!ms) return;
    const delayMinutes = Math.max(0.5, ms * 2 / 6e4);
    chrome.alarms.create(`timeout:${sessionId}:${state}`, { delayInMinutes: delayMinutes });
  }
  _clearAlarm(sessionId, state) {
    void chrome.alarms.clear(`timeout:${sessionId}:${state}`);
  }
  _cleanup(sessionId) {
    this._uiResolvers.delete(sessionId);
    this._urlResolvers.delete(sessionId);
    this._failRejecters.delete(sessionId);
    const states = [
      "creating_tab",
      "waiting_for_ui",
      "injecting_bootstrap",
      "waiting_for_url",
      "linking"
    ];
    for (const state of states) {
      void chrome.alarms.clear(`timeout:${sessionId}:${state}`);
    }
  }
};

// src/api/BackendClient.ts
var DEFAULT_BASE = "http://localhost:8000/api/v1";
var BackendClient = class {
  constructor(baseUrl = DEFAULT_BASE) {
    this.baseUrl = baseUrl;
  }
  async reportState(sessionId, state) {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    if (!res.ok) {
      throw new Error(`reportState(${state}) \u2192 ${res.status}: ${await res.text()}`);
    }
  }
  async linkSession(sessionId, url) {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      throw new Error(`linkSession \u2192 ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
  async failSession(sessionId, reason, detail) {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/fail`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, ...detail ? { detail } : {} })
    });
    if (!res.ok) {
      throw new Error(`failSession(${reason}) \u2192 ${res.status}: ${await res.text()}`);
    }
  }
};

// src/providers/adapters/ChatGPTAdapter.ts
var ChatGPTAdapter = class {
  platform = "chatgpt";
  homeUrl = "https://chatgpt.com/";
  isConversationUrl(url) {
    return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\/[a-zA-Z0-9_-]+/.test(url);
  }
  async injectBootstrapMessage(tabId, message) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectChatGPT,
      args: [message]
    });
  }
};
function injectChatGPT(message) {
  const editor = document.querySelector('div#prompt-textarea[contenteditable="true"]') ?? document.querySelector('[contenteditable="true"][data-id]');
  if (!editor) {
    throw new Error("[ConnectingDots] ChatGPT: input editor not found");
  }
  editor.focus();
  document.execCommand("insertText", false, message);
  setTimeout(() => {
    const sendBtn = document.querySelector('button[data-testid="send-button"]') ?? document.querySelector('button[aria-label="Send message"]');
    sendBtn?.click();
  }, 100);
}

// src/providers/adapters/ClaudeAdapter.ts
var ClaudeAdapter = class {
  platform = "claude";
  homeUrl = "https://claude.ai/new";
  isConversationUrl(url) {
    return /^https:\/\/claude\.ai\/chat\/[a-zA-Z0-9_-]+/.test(url);
  }
  async injectBootstrapMessage(tabId, message) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectClaude,
      args: [message]
    });
  }
};
function injectClaude(message) {
  const editor = document.querySelector('.ProseMirror[contenteditable="true"]') ?? document.querySelector('[contenteditable="true"][role="textbox"]');
  if (!editor) {
    throw new Error("[ConnectingDots] Claude: input editor not found");
  }
  editor.focus();
  document.execCommand("insertText", false, message);
  setTimeout(() => {
    const sendBtn = document.querySelector('button[aria-label="Send Message"]') ?? document.querySelector('button[data-testid="send-button"]') ?? document.querySelector('button[type="submit"]');
    sendBtn?.click();
  }, 100);
}

// src/providers/adapters/GeminiAdapter.ts
var GeminiAdapter = class {
  platform = "gemini";
  homeUrl = "https://gemini.google.com/app";
  isConversationUrl(url) {
    return /^https:\/\/gemini\.google\.com\/app\/[a-zA-Z0-9_-]+/.test(url);
  }
  async injectBootstrapMessage(tabId, message) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectGemini,
      args: [message]
    });
  }
};
function injectGemini(message) {
  const editor = document.querySelector('rich-textarea [contenteditable="true"]') ?? document.querySelector('.ql-editor[contenteditable="true"]') ?? document.querySelector('[contenteditable="true"][role="textbox"]');
  if (!editor) {
    throw new Error("[ConnectingDots] Gemini: input editor not found");
  }
  editor.focus();
  document.execCommand("insertText", false, message);
  setTimeout(() => {
    const sendBtn = document.querySelector('button[aria-label="Send message"]') ?? document.querySelector("button.send-button") ?? document.querySelector("button[mat-icon-button][aria-label]");
    sendBtn?.click();
  }, 100);
}

// src/providers/ProviderRegistry.ts
var ProviderRegistry = class {
  _adapters = /* @__PURE__ */ new Map([
    ["chatgpt", new ChatGPTAdapter()],
    ["claude", new ClaudeAdapter()],
    ["gemini", new GeminiAdapter()]
  ]);
  get(platform) {
    return this._adapters.get(platform);
  }
  isTrackedUrl(url) {
    for (const [platform, adapter] of this._adapters) {
      if (adapter.isConversationUrl(url)) return { adapter, platform };
    }
    return void 0;
  }
  isProviderUrl(url) {
    for (const [, adapter] of this._adapters) {
      if (url.startsWith(new URL(adapter.homeUrl).origin)) return true;
    }
    return false;
  }
};

// src/background.ts
var store = new SessionStore();
var bus = new EventBus();
var tabs = new TabManager(store);
var api = new BackendClient();
var providers = new ProviderRegistry();
var orch = new SessionOrchestrator(bus, store, tabs, api, providers);
void orch.restore();
chrome.runtime.onInstalled.addListener(() => void orch.restore());
chrome.runtime.onStartup.addListener(() => void orch.restore());
chrome.runtime.onMessageExternal.addListener(
  (message, _sender, sendResponse) => {
    if (message.type !== "CREATE_PROVIDER_SESSION") {
      sendResponse({ success: false, error: "Unknown message type" });
      return false;
    }
    const session = {
      sessionId: message.sessionId,
      projectId: message.projectId,
      platform: message.platform,
      bootstrapMessage: message.bootstrapMessage,
      state: "pending",
      tabId: null,
      linkedUrl: null,
      createdAt: Date.now()
    };
    orch.start(session).then(() => sendResponse({ success: true })).catch((err) => {
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }
);
chrome.runtime.onMessage.addListener(
  (message, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === void 0) return;
    const sessionId = tabs.getSessionId(tabId);
    if (!sessionId) return;
    if (message.type === "CS_UI_READY") {
      bus.emit({ type: "UI_READY", sessionId });
    } else if (message.type === "CS_AUTH_REQUIRED") {
      bus.emit({ type: "SESSION_FAILED", sessionId, reason: "auth_required" });
    }
  }
);
function handleNavigation(details) {
  const { tabId, url, frameId } = details;
  if (frameId !== void 0 && frameId !== 0) return;
  const sessionId = tabs.getSessionId(tabId);
  if (!sessionId) return;
  if (providers.isTrackedUrl(url)) {
    bus.emit({ type: "URL_DETECTED", sessionId, url });
  }
}
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
chrome.webNavigation.onCompleted.addListener(handleNavigation);
chrome.tabs.onRemoved.addListener((tabId) => {
  void orch.notifyTabClosed(tabId);
});
var TIMEOUT_REASON_MAP = {
  creating_tab: "backend_error",
  waiting_for_ui: "ui_timeout",
  injecting_bootstrap: "bootstrap_failed",
  waiting_for_url: "url_timeout",
  linking: "backend_error"
};
chrome.alarms.onAlarm.addListener((alarm) => {
  const match = alarm.name.match(/^timeout:([^:]+):(.+)$/);
  if (!match) return;
  const [, sessionId, rawState] = match;
  const reason = TIMEOUT_REASON_MAP[rawState] ?? "backend_error";
  void orch.notifyAlarmTimeout(sessionId, reason);
});
