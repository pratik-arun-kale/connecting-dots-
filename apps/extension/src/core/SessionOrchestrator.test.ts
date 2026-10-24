import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionOrchestrator } from './SessionOrchestrator'
import type { EventBus } from './EventBus'
import type { TabManager } from './TabManager'
import type { SessionStore } from '../storage/SessionStore'
import type { BackendClient } from '../api/BackendClient'
import type { ProviderRegistry } from '../providers/ProviderRegistry'
import type { ProviderSession } from '../types/session'

function makeSession(overrides: Partial<ProviderSession> = {}): ProviderSession {
  return {
    sessionId: 'sess-1',
    projectId: 'proj-1',
    platform: 'chatgpt',
    bootstrapMessage: null,
    state: 'pending',
    tabId: null,
    linkedUrl: null,
    createdAt: 1,
    ...overrides,
  }
}

describe('SessionOrchestrator.start', () => {
  let saved: Map<string, ProviderSession>
  let store: SessionStore
  let orch: SessionOrchestrator
  let drive: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    saved = new Map()
    store = {
      get: vi.fn(async (id: string) => saved.get(id)),
      set: vi.fn(async (s: ProviderSession) => { saved.set(s.sessionId, s) }),
    } as unknown as SessionStore
    const bus = { on: vi.fn() } as unknown as EventBus
    // _drive opens tabs and talks to the backend; only whether it starts matters here.
    drive = vi.spyOn(SessionOrchestrator.prototype as never, '_drive').mockResolvedValue(undefined as never)
    orch = new SessionOrchestrator(bus, store, {} as TabManager, {} as BackendClient, {} as ProviderRegistry)
  })

  it('stores and drives a new session', async () => {
    await orch.start(makeSession())

    expect(saved.get('sess-1')?.state).toBe('pending')
    expect(drive).toHaveBeenCalledTimes(1)
  })

  it('ignores a repeat request instead of resetting a session in progress', async () => {
    await orch.start(makeSession())
    saved.set('sess-1', makeSession({ state: 'waiting_for_url', tabId: 42 }))

    await orch.start(makeSession())

    expect(saved.get('sess-1')).toMatchObject({ state: 'waiting_for_url', tabId: 42 })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(drive).toHaveBeenCalledTimes(1)
  })
})
