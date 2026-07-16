import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { searchConversations, HttpStatusError, TimeoutError, MalformedResponseError } from './searchClient'

const validBody = {
  query_used: 'RAG',
  corrective_triggered: false,
  chunks_indexed: 5,
  total_conversations: 1,
  conversations: [
    {
      conversation_id: 'c1',
      title: 'RAG Chunking',
      chat_url: 'https://chatgpt.com/c/1',
      provider: 'chatgpt',
      relevance_score: 3.7,
      summary: null,
      top_relevant_snippets: ['snippet'],
    },
  ],
}

function mockFetchOnce(impl: (init: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => impl(init)))
}

describe('searchConversations', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns a sanitized response on success', async () => {
    mockFetchOnce(() => new Response(JSON.stringify(validBody), { status: 200 }))
    const result = await searchConversations(
      { projectId: 'p1', query: 'RAG', topK: 10 },
      new AbortController().signal,
    )
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].title).toBe('RAG Chunking')
  })

  it('sends project_id/query/top_k in the POST body to /search/conversations', async () => {
    let capturedBody: unknown
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify(validBody), { status: 200 })
    }))
    await searchConversations({ projectId: 'proj-42', query: 'FastAPI', topK: 7 }, new AbortController().signal)
    expect(capturedUrl).toContain('/search/conversations')
    expect(capturedBody).toEqual({ project_id: 'proj-42', query: 'FastAPI', top_k: 7 })
  })

  it('throws HttpStatusError with the status code on a non-2xx response', async () => {
    mockFetchOnce(() => new Response('Internal Server Error', { status: 500 }))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'HttpStatusError', status: 500 })
  })

  it('throws HttpStatusError(401) on unauthorized', async () => {
    mockFetchOnce(() => new Response('', { status: 401 }))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal),
    ).rejects.toThrow(HttpStatusError)
  })

  it('throws MalformedResponseError when the body is not valid JSON', async () => {
    mockFetchOnce(() => new Response('not json{{{', { status: 200 }))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal),
    ).rejects.toThrow(MalformedResponseError)
  })

  it('throws MalformedResponseError when the body is valid JSON but the wrong shape', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ unexpected: true }), { status: 200 }))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal),
    ).rejects.toThrow(MalformedResponseError)
  })

  it('throws TimeoutError when the deadline elapses before the fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))

    const promise = searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal, 5_000)
    const assertion = expect(promise).rejects.toThrow(TimeoutError)
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it('re-throws a raw AbortError (not TimeoutError) when the EXTERNAL signal aborts — supersession, not timeout', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))

    const promise = searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, ctrl.signal, 5_000)
    ctrl.abort() // caller cancels — e.g. a newer keystroke fired
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects immediately if the external signal is already aborted before dispatch', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    mockFetchOnce(() => new Response(JSON.stringify(validBody), { status: 200 }))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, ctrl.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('propagates a network-level TypeError (offline/DNS/connection-refused) unmodified', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(
      searchConversations({ projectId: 'p1', query: 'RAG', topK: 10 }, new AbortController().signal),
    ).rejects.toThrow(TypeError)
  })
})
