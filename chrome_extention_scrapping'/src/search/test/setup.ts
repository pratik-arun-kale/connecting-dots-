import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Minimal `chrome` global for jsdom: useWorkspaceStore's persist middleware
// calls chrome.storage.local.get() on import, and openChatUrl() checks
// chrome.tabs.create(). Real behavior is exercised in the built extension —
// this just keeps unit/component tests from crashing on an undefined global.
;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    create: vi.fn(),
  },
}

