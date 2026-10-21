export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity'

export interface Platform {
  id:            PlatformId
  label:         string
  color:         string
  url:           string
  hostPatterns:  string[]
  connected:     boolean
  activeTabCount: number
  lastActivity:  number | null
  tabIds:        number[]
}

export const PLATFORM_DEFS: Record<PlatformId, Omit<Platform, 'connected' | 'activeTabCount' | 'lastActivity' | 'tabIds'>> = {
  chatgpt: {
    id:           'chatgpt',
    label:        'ChatGPT',
    color:        '#10a37f',
    url:          'https://chatgpt.com',
    hostPatterns: ['chatgpt.com', 'chat.openai.com'],
  },
  claude: {
    id:           'claude',
    label:        'Claude',
    color:        '#d97706',
    url:          'https://claude.ai',
    hostPatterns: ['claude.ai'],
  },
  gemini: {
    id:           'gemini',
    label:        'Gemini',
    color:        '#4285f4',
    url:          'https://gemini.google.com',
    hostPatterns: ['gemini.google.com'],
  },
  perplexity: {
    id:           'perplexity',
    label:        'Perplexity',
    color:        '#8b5cf6',
    url:          'https://www.perplexity.ai',
    hostPatterns: ['perplexity.ai'],
  },
}

export function makePlatform(id: PlatformId): Platform {
  return { ...PLATFORM_DEFS[id], connected: false, activeTabCount: 0, lastActivity: null, tabIds: [] }
}

export function getPlatformForUrl(url: string): PlatformId | null {
  try {
    const host = new URL(url).hostname
    for (const [id, def] of Object.entries(PLATFORM_DEFS)) {
      if (def.hostPatterns.some(p => host === p || host.endsWith('.' + p))) {
        return id as PlatformId
      }
    }
  } catch { /* invalid url */ }
  return null
}
