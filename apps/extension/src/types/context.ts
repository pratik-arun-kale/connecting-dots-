import type { PlatformId } from './platform'

export interface Context {
  id:         string
  projectId:  string
  platform:   PlatformId
  title:      string
  url:        string
  preview:    string
  capturedAt: number
}

export interface ApiContext {
  id:          string
  project_id:  string
  platform?:   string
  title?:      string
  url?:        string
  content?:    string
  created_at:  string
}

export function normalizeContext(c: ApiContext): Context {
  return {
    id:         c.id,
    projectId:  c.project_id,
    platform:   (c.platform as PlatformId) ?? 'chatgpt',
    title:      c.title ?? 'Untitled capture',
    url:        c.url ?? '',
    preview:    c.content?.slice(0, 120) ?? '',
    capturedAt: new Date(c.created_at).getTime(),
  }
}
