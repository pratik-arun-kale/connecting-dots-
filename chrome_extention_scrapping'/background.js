// src/api.ts
var API_BASE = "http://localhost:8000/api/v1";
async function fetchJSON(url, init = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}
var api = {
  async health() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3e3);
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  },
  getProject(id) {
    return fetchJSON(`${API_BASE}/projects/${id}`);
  },
  captureContext(payload) {
    return fetchJSON(`${API_BASE}/contexts/capture`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  /**
   * Bind a live conversation URL to a session (idempotent: same URL → 200).
   * Throws on HTTP 409 (different URL already linked) or other errors.
   */
  async linkSession(sessionId, url) {
    await fetchJSON(`${API_BASE}/sessions/${sessionId}/link`, {
      method: "PATCH",
      body: JSON.stringify({ url })
    });
  }
};

// src/state.ts
var KEY = "workspaceState";
var DEFAULT = {
  activeProject: null,
  sessions: [],
  tabMappings: {},
  captureHistory: []
};
var store = {
  async get() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEY, (result) => {
        resolve({ ...DEFAULT, ...result[KEY] });
      });
    });
  },
  async set(updates) {
    const current = await this.get();
    const next = { ...current, ...updates };
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [KEY]: next }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(next);
        }
      });
    });
  },
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: { ...DEFAULT } }, resolve);
    });
  }
};

// src/TabRegistry.ts
var STORAGE_KEY = "tabRegistry";
var _cache = null;
async function load() {
  if (_cache !== null) return _cache;
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      _cache = result[STORAGE_KEY] ?? {};
      resolve(_cache);
    });
  });
}
async function persist(map) {
  _cache = map;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: map }, resolve);
  });
}
var TabRegistry = {
  async set(entry) {
    const map = await load();
    map[String(entry.tabId)] = entry;
    await persist(map);
  },
  async get(tabId) {
    const map = await load();
    return map[String(tabId)] ?? null;
  },
  async update(tabId, patch) {
    const map = await load();
    const entry = map[String(tabId)];
    if (!entry) return;
    map[String(tabId)] = { ...entry, ...patch };
    await persist(map);
  },
  async remove(tabId) {
    const map = await load();
    delete map[String(tabId)];
    await persist(map);
  },
  async getAll() {
    const map = await load();
    return Object.values(map);
  },
  /** Must be called when the SW restarts to re-warm the cache. */
  async restore() {
    _cache = null;
    await load();
  }
};

// src/providers/ChatGPTProvider.ts
var CONVERSATION_RE = /^https:\/\/chat\.openai\.com\/c\/[a-zA-Z0-9-]+/;
var ChatGPTProvider = {
  platform: "chatgpt",
  homeUrl: "https://chat.openai.com/",
  matchesHost: (url) => url.startsWith("https://chat.openai.com/"),
  isConversationUrl: (url) => CONVERSATION_RE.test(url)
};

// src/providers/ClaudeProvider.ts
var CONVERSATION_RE2 = /^https:\/\/claude\.ai\/chat\/[a-zA-Z0-9-]+/;
var ClaudeProvider = {
  platform: "claude",
  homeUrl: "https://claude.ai/",
  matchesHost: (url) => url.startsWith("https://claude.ai/"),
  isConversationUrl: (url) => CONVERSATION_RE2.test(url)
};

// src/providers/GeminiProvider.ts
var CONVERSATION_RE3 = /^https:\/\/gemini\.google\.com\/app\/[a-zA-Z0-9_-]+/;
var GeminiProvider = {
  platform: "gemini",
  homeUrl: "https://gemini.google.com/",
  matchesHost: (url) => url.startsWith("https://gemini.google.com/"),
  isConversationUrl: (url) => CONVERSATION_RE3.test(url)
};

// src/providers/index.ts
var ALL = [ChatGPTProvider, ClaudeProvider, GeminiProvider];
var ProviderRegistry = {
  forUrl(url) {
    return ALL.find((p) => p.matchesHost(url)) ?? null;
  },
  forPlatform(platform) {
    return ALL.find((p) => p.platform === platform) ?? null;
  },
  all() {
    return ALL;
  }
};

// src/SyncQueue.ts
var STORAGE_KEY2 = "syncQueue";
var RETRY_DELAYS_MS = [1e3, 2e3, 4e3, 8e3, 16e3, 32e3];
var MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
async function load2() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY2, (result) => {
      resolve(result[STORAGE_KEY2] ?? {});
    });
  });
}
async function persist2(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY2]: map }, resolve);
  });
}
var SyncQueue = {
  /** Add a session to the retry queue. No-op if already queued for the same URL. */
  async enqueue(sessionId, url) {
    const map = await load2();
    if (map[sessionId]?.url === url) return;
    map[sessionId] = { sessionId, url, attempts: 0, nextRetryAt: Date.now() };
    await persist2(map);
  },
  /** Remove a successfully synced entry. */
  async remove(sessionId) {
    const map = await load2();
    delete map[sessionId];
    await persist2(map);
  },
  /** Return all entries whose retry window has elapsed. */
  async due() {
    const map = await load2();
    const now = Date.now();
    return Object.values(map).filter((e) => e.nextRetryAt <= now);
  },
  /**
   * Record a failed attempt and schedule the next retry.
   * Drops the entry permanently when max attempts is reached.
   */
  async recordFailure(sessionId) {
    const map = await load2();
    const entry = map[sessionId];
    if (!entry) return;
    const attempts = entry.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      console.warn("[SyncQueue] Giving up on session", sessionId, "after", MAX_ATTEMPTS, "attempts");
      delete map[sessionId];
    } else {
      map[sessionId] = {
        ...entry,
        attempts,
        nextRetryAt: Date.now() + RETRY_DELAYS_MS[attempts]
      };
    }
    await persist2(map);
  }
};

// src/SessionLinker.ts
var SessionLinker = {
  /**
   * Entry point for both SPA and full-page navigation events.
   * No-ops if the tab isn't tracked or the URL isn't a conversation.
   */
  async onTabUrlChange(tabId, url) {
    const provider = ProviderRegistry.forUrl(url);
    if (!provider?.isConversationUrl(url)) return;
    const entry = await TabRegistry.get(tabId);
    if (!entry) return;
    if (entry.linkedUrl === url && entry.syncStatus === "synced") return;
    await _link(entry.sessionId, url, tabId);
  },
  /**
   * Process all due SyncQueue entries. Called by the alarm handler and on SW
   * install/update to flush any entries that survived SW termination.
   */
  async processSyncQueue() {
    const due = await SyncQueue.due();
    if (due.length === 0) return;
    console.log("[SessionLinker] Processing", due.length, "queued link(s)");
    for (const entry of due) {
      try {
        await api.linkSession(entry.sessionId, entry.url);
        await SyncQueue.remove(entry.sessionId);
        console.log("[SessionLinker] Retry succeeded:", entry.sessionId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("HTTP 409")) {
          await SyncQueue.remove(entry.sessionId);
          console.warn("[SessionLinker] Conflict on retry, dropping:", entry.sessionId);
        } else {
          await SyncQueue.recordFailure(entry.sessionId);
          console.warn("[SessionLinker] Retry failed:", entry.sessionId, msg);
        }
      }
    }
  }
};
async function _link(sessionId, url, tabId) {
  try {
    await api.linkSession(sessionId, url);
    await TabRegistry.update(tabId, { linkedUrl: url, syncStatus: "synced" });
    await SyncQueue.remove(sessionId);
    console.log("[SessionLinker] Linked", sessionId, "\u2192", url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("HTTP 409")) {
      await TabRegistry.update(tabId, { syncStatus: "failed" });
      console.warn("[SessionLinker] Session already linked to different URL:", sessionId);
      return;
    }
    await SyncQueue.enqueue(sessionId, url);
    await TabRegistry.update(tabId, { syncStatus: "pending" });
    console.warn("[SessionLinker] Link failed, queued for retry:", sessionId, msg);
  }
}

// src/background.ts
var PLATFORM_URLS = {
  chatgpt: "https://chat.openai.com/",
  claude: "https://claude.ai/",
  gemini: "https://gemini.google.com/"
};
var NAV_FILTER = {
  url: [
    { hostEquals: "chat.openai.com" },
    { hostEquals: "claude.ai" },
    { hostEquals: "gemini.google.com" }
  ]
};
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => {
  void SessionLinker.onTabUrlChange(tabId, url);
}, NAV_FILTER);
chrome.webNavigation.onCompleted.addListener(({ tabId, url, frameId }) => {
  if (frameId !== 0) return;
  void SessionLinker.onTabUrlChange(tabId, url);
}, NAV_FILTER);
chrome.tabs.onRemoved.addListener((tabId) => {
  void TabRegistry.remove(tabId);
});
var ALARM_NAME = "sync-queue-retry";
chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void SessionLinker.processSyncQueue();
  }
});
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type !== "OPEN_PROJECT_SESSIONS") return false;
  const { projectId, sessions } = message.payload ?? {};
  if (!projectId || !Array.isArray(sessions)) {
    sendResponse({ success: false, error: "Invalid payload" });
    return false;
  }
  void (async () => {
    try {
      await store.set({
        activeProject: { id: projectId, name: "Loading\u2026" },
        sessions: sessions.map((s) => ({ id: s.sessionId, source_platform: s.platform }))
      });
      try {
        const project = await api.getProject(projectId);
        await store.set({ activeProject: { id: projectId, name: project.name } });
      } catch (err) {
        console.warn("[Workspace] Could not fetch project name:", err);
      }
      for (const { sessionId, platform } of sessions) {
        const url = PLATFORM_URLS[platform];
        if (!url) {
          console.warn("[Workspace] Unknown platform:", platform);
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
            syncStatus: "pending"
          });
          console.log("[Workspace] Tab", tab.id, "\u2192", platform, "\u2192 session", sessionId);
        }
      }
      sendResponse({ success: true });
    } catch (err) {
      console.error("[Workspace] OPEN_PROJECT_SESSIONS failed:", err);
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action;
  if (action === "GET_TAB_MAPPING") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ mapping: null });
      return false;
    }
    void TabRegistry.get(tabId).then((entry) => sendResponse({ mapping: entry }));
    return true;
  }
  if (action === "OPEN_PLATFORM_TAB") {
    const { platform } = message;
    const url = PLATFORM_URLS[platform];
    if (!url) {
      sendResponse({ success: false, error: "Unknown platform" });
      return false;
    }
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
            syncStatus: "pending"
          });
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }
  if (action === "RECORD_CAPTURE") {
    const { sessionId, platform, url, messageCount } = message.data ?? {};
    void (async () => {
      try {
        const state = await store.get();
        const entry = { sessionId, platform, url, messageCount, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
        await store.set({ captureHistory: [entry, ...state.captureHistory].slice(0, 50) });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }
  if (action !== "CAPTURE_PAGE") return false;
  void (async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error("No active tab found.");
      const tabUrl = activeTab.url ?? "";
      if (/^(chrome|chrome-extension|about):/.test(tabUrl)) {
        throw new Error("Cannot capture content from browser internal pages.");
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      });
      const payload = results?.[0]?.result;
      if (!payload || typeof payload !== "object") throw new Error("Content script returned unexpected value.");
      await _saveCapture(payload);
      try {
        const mod = await import(chrome.runtime.getURL("pipeline/index.js"));
        if (typeof mod.processCapture === "function") {
          await _saveProcessedCapture(mod.processCapture(payload));
        }
      } catch (procErr) {
        console.warn("[Workspace] Processing pipeline failed:", procErr);
      }
      sendResponse({ success: true, title: payload["title"], url: payload["url"] });
    } catch (err) {
      console.error("[Workspace] CAPTURE_PAGE error:", err);
      sendResponse({ success: false, error: err instanceof Error ? err.message : "Unknown error." });
    }
  })();
  return true;
});
var PAGE_CAPTURES_KEY = "pageCaptures";
var MAX_CAPTURES = 50;
async function _saveCapture(record) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(PAGE_CAPTURES_KEY, (result) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const existing = result[PAGE_CAPTURES_KEY] ?? [];
      chrome.storage.local.set({ [PAGE_CAPTURES_KEY]: [record, ...existing].slice(0, MAX_CAPTURES) }, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
  });
}
async function _saveProcessedCapture(record) {
  const KEY2 = "pageCapturesProcessed";
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(KEY2, (result) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const existing = result[KEY2] ?? [];
      chrome.storage.local.set({ [KEY2]: [record, ...existing].slice(0, MAX_CAPTURES) }, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(PAGE_CAPTURES_KEY, (result) => {
    if (!result[PAGE_CAPTURES_KEY]) {
      chrome.storage.local.set({ [PAGE_CAPTURES_KEY]: [] });
    }
  });
  void TabRegistry.restore().then(() => SessionLinker.processSyncQueue());
  console.log("[Workspace] Extension installed/updated.");
});
