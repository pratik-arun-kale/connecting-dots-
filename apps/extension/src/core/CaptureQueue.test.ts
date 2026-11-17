import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureQueue } from './CaptureQueue'
import { CaptureRejectedError } from '../api/BackendClient'
import type { BackendClient, CapturePayload, CaptureResponse } from '../api/BackendClient'

// In-memory chrome.storage.local, enough for the queue.
let store: Record<string, unknown>
beforeEach(() => {
  store = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
      },
    },
  })
})

const payload = (key: string): CapturePayload => ({
  idempotency_key: key,
  platform: 'claude',
  chat_url: 'https://claude.ai/chat/1',
  captured_at: '2026-11-17T00:00:00Z',
  title: 't',
  messages: [{ role: 'user', content: 'x', timestamp: null, index: 0 }],
  metadata: null,
})

const ok: CaptureResponse = {
  context_id: 'ctx-1', session_id: 's', title: 't', messages_count: 1,
  platform: 'claude', chat_url: 'u', captured_at: 'now', created: true,
}

function queueWith(capture: (projectId: string, p: CapturePayload) => Promise<CaptureResponse>) {
  const calls: string[] = []
  const client = {
    captureConversation: async (projectId: string, p: CapturePayload) => {
      calls.push(p.idempotency_key)
      return capture(projectId, p)
    },
  } as unknown as BackendClient
  return { queue: new CaptureQueue(client), calls }
}

describe('CaptureQueue', () => {
  it('stores the result of a successful upload', async () => {
    const { queue } = queueWith(async () => ok)
    await queue.enqueue('p', payload('k1'))
    await queue.flush()
    const entry = await queue.getEntry('k1')
    expect(entry?.status).toBe('done')
    expect(entry?.result?.context_id).toBe('ctx-1')
  })

  it('treats "already saved" as done, with the existing note, and never retries it', async () => {
    const { queue, calls } = queueWith(async () => {
      throw new CaptureRejectedError(409, 'duplicate', 'Already saved in this project.', 'ctx-existing')
    })
    await queue.enqueue('p', payload('k2'))
    await queue.flush()
    await queue.flush()
    const entry = await queue.getEntry('k2')
    expect(entry?.status).toBe('done')
    expect(entry?.duplicateOf).toBe('ctx-existing')
    expect(entry?.result).toBeUndefined()
    expect(calls).toEqual(['k2'])
  })

  it('fails a request the API will always refuse at once', async () => {
    const { queue, calls } = queueWith(async () => {
      throw new CaptureRejectedError(422, 'validation_error', 'bad', null)
    })
    await queue.enqueue('p', payload('k3'))
    await queue.flush()
    expect((await queue.getEntry('k3'))?.status).toBe('failed')
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['a network error', new Error('Failed to fetch')],
    ['a 500', new CaptureRejectedError(500, 'internal_error', 'boom', null)],
    ['a 429', new CaptureRejectedError(429, 'too_many_requests', 'slow down', null)],
    ['a 401', new CaptureRejectedError(401, 'unauthorized', 'signed out', null)],
  ])('keeps %s pending for a retry with the same key', async (_label, error) => {
    let attempt = 0
    const { queue, calls } = queueWith(async () => {
      attempt += 1
      if (attempt === 1) throw error
      return ok
    })
    vi.spyOn(Math, 'random').mockReturnValue(0) // shortest backoff
    await queue.enqueue('p', payload('k4'))
    await queue.flush()
    expect((await queue.getEntry('k4'))?.status).toBe('pending')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000) // past the backoff
    await queue.flush()
    vi.useRealTimers()

    expect((await queue.getEntry('k4'))?.status).toBe('done')
    expect(calls).toEqual(['k4', 'k4'])
  })
})
