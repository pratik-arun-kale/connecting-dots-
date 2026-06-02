const BASE = 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      signal:  ctrl.signal,
      ...init,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, `HTTP ${res.status}: ${body.slice(0, 160)}`)
    }
    return res.json() as Promise<T>
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ── Typed response shapes ───────────────────────────────────────────────────

export interface ApiProjectItem {
  id:          string
  name:        string
  description: string | null
  created_at:  string
  updated_at:  string
  session_count?: number
  context_count?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
}

// ── API surface ─────────────────────────────────────────────────────────────

export const api = {
  health: (): Promise<boolean> =>
    fetch(`${BASE}/health`, {
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(3000) : undefined,
    }).then(r => r.ok).catch(() => false),

  // BUG WAS HERE: backend returns { items, total } — must unwrap .items
  getProjects: (): Promise<ApiProjectItem[]> =>
    request<PaginatedResponse<ApiProjectItem>>('/projects').then(r => r.items),

  createProject: (name: string): Promise<ApiProjectItem> =>
    request<ApiProjectItem>('/projects', {
      method: 'POST',
      body:   JSON.stringify({ name }),
    }),

  deleteProject: (id: string): Promise<void> =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  getContexts: (projectId: string): Promise<unknown[]> =>
    request<PaginatedResponse<unknown>>(`/projects/${projectId}/contexts`).then(r => r.items),

  captureConversation: (projectId: string, payload: Record<string, unknown>): Promise<unknown> =>
    request<unknown>(`/projects/${projectId}/capture`, {
      method: 'POST',
      body:   JSON.stringify(payload),
    }),
}
