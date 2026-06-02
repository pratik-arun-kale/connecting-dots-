import { useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { getPlatformForUrl } from '@/types/platform'

type CaptureStatus = 'idle' | 'capturing' | 'success' | 'error'

interface CaptureResult {
  contextId:    string
  sessionId:    string
  title:        string
  messageCount: number
  platform:     string
  capturedAt:   string
}

interface UseCaptureContextReturn {
  status:      CaptureStatus
  result:      CaptureResult | null
  errorMsg:    string | null
  canCapture:  boolean
  capture:     () => Promise<void>
  reset:       () => void
}

async function computeIdempotencyKey(projectId: string, url: string): Promise<string> {
  const minuteBucket = new Date().toISOString().slice(0, 16) // minute precision
  const raw    = new TextEncoder().encode(`${projectId}:${url}:${minuteBucket}`)
  const buf    = await crypto.subtle.digest('SHA-256', raw)
  const hex    = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 32)
}

export function useCaptureContext(): UseCaptureContextReturn {
  const { activeProjectId, platforms } = useWorkspaceStore()
  const [status,   setStatus]   = useState<CaptureStatus>('idle')
  const [result,   setResult]   = useState<CaptureResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Determine if there is an active AI tab that can be captured
  const activePlatform = Object.values(platforms).find(p => p.connected && p.tabIds.length > 0) ?? null
  const canCapture     = !!activeProjectId && !!activePlatform && status === 'idle'

  const capture = useCallback(async () => {
    if (!activeProjectId || !activePlatform) return
    setStatus('capturing')
    setResult(null)
    setErrorMsg(null)

    try {
      const tabId    = activePlatform.tabIds[0]
      const tab      = await chrome.tabs.get(tabId).catch(() => null)
      if (!tab?.url) throw new Error('TAB_DEAD')

      const platform = getPlatformForUrl(tab.url)
      if (!platform) throw new Error('PLATFORM_UNKNOWN')

      const idempotencyKey = await computeIdempotencyKey(activeProjectId, tab.url)

      const response = await chrome.runtime.sendMessage({
        type:           'CAPTURE_CONTEXT_REQUEST',
        projectId:      activeProjectId,
        tabId,
        platform,
        idempotencyKey,
      })

      if (!response?.ok) {
        const msg = response?.error === 'LOCK_HELD'
          ? 'Capture already in progress.'
          : response?.error === 'TAB_DEAD'
          ? 'AI tab was closed.'
          : response?.error === 'EXTRACT_FAILED'
          ? 'Could not extract conversation. Try scrolling the page first.'
          : response?.detail ?? 'Capture failed.'
        throw new Error(msg)
      }

      setResult({
        contextId:    response.contextId,
        sessionId:    response.sessionId,
        title:        response.title,
        messageCount: response.messageCount,
        platform:     response.platform,
        capturedAt:   response.capturedAt,
      })
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Capture failed.')
      setStatus('error')
    }
  }, [activeProjectId, activePlatform])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
  }, [])

  return { status, result, errorMsg, canCapture, capture, reset }
}
