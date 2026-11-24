import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Minimal `chrome` global for jsdom: useWorkspaceStore's persist middleware
// calls chrome.storage.local.get() on import, and openChatUrl() checks
// chrome.tabs.create(). Real behavior is exercised in the built extension —
// this just keeps unit/component tests from crashing on an undefined global.
// storage.session + storage.onChanged added for src/auth/* (tokenStorage.ts
// reads storage.session for the access token; useAuthSession.ts registers
// an onChanged listener at module-load time) — without these, importing
// anything that pulls in the auth module graph (e.g. searchClient.ts's
// authorizedFetch import) throws on an undefined `.session`/`.onChanged`.
;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn(),
  },
}

