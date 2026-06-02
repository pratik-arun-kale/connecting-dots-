export interface Project {
  id:           string
  name:         string
  color:        string
  sessionCount: number
  contextCount: number
  lastActive:   number   // unix ms
  status:       'active' | 'idle' | 'archived'
  createdAt:    number
}

export interface ApiProject {
  id:            string
  name:          string
  created_at:    string
  session_count?: number
  context_count?: number
}

export function normalizeProject(p: ApiProject, idx: number): Project {
  const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6']
  return {
    id:           p.id,
    name:         p.name,
    color:        COLORS[p.id.charCodeAt(0) % COLORS.length] ?? COLORS[idx % COLORS.length],
    sessionCount: p.session_count ?? 0,
    contextCount: p.context_count ?? 0,
    lastActive:   new Date(p.created_at).getTime(),
    status:       'idle',
    createdAt:    new Date(p.created_at).getTime(),
  }
}
