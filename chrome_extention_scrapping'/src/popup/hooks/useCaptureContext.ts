import { useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

type CaptureStatus = 'idle' | 'capturing' | 'success' | 'error'

interface CaptureResult {
  contextId:    string
  sessionId:    string
  title:        string
  messageCount: number
  platform:     string
  capturedAt:   string
  chatUrl:      string
}

async function computeIdempotencyKey(projectId: string, url: string): Promise<string> {
  const minuteBucket = new Date().toISOString().slice(0, 16)
  const raw  = new TextEncoder().encode(`${projectId}:${url}:${minuteBucket}`)
  const buf  = await crypto.subtle.digest('SHA-256', raw)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export function useCaptureContext() {
  const { activeProjectId } = useWorkspaceStore()
  const [status,   setStatus]   = useState<CaptureStatus>('idle')
  const [result,   setResult]   = useState<CaptureResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Button is available whenever a project is selected and we're not mid-capture
  const canCapture = !!activeProjectId && status === 'idle'

  const capture = useCallback(async () => {
    if (!activeProjectId) return
    setStatus('capturing')
    setResult(null)
    setErrorMsg(null)

    try {
      // Get whichever tab is currently active in the browser
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!activeTab?.id || !activeTab.url) throw new Error('No active tab found.')

      const idempotencyKey = await computeIdempotencyKey(activeProjectId, activeTab.url)

      // Platform is determined inside the injected script by hostname
      const response = await chrome.runtime.sendMessage({
        type:           'CAPTURE_CONTEXT_REQUEST',
        projectId:      activeProjectId,
        tabId:          activeTab.id,
        platform:       'auto',   // resolved by executeScript in background
        idempotencyKey,
      })

      if (!response?.ok) {
        const msg =
          response?.error === 'LOCK_HELD'     ? 'Capture already in progress for this tab.' :
          response?.error === 'TAB_DEAD'      ? 'Tab was closed.' :
          response?.error === 'EXTRACT_FAILED'? response?.detail ?? 'Nothing found on this page.' :
          response?.detail ?? 'Capture failed.'
        throw new Error(msg)
      }

      setResult({
        contextId:    response.contextId,
        sessionId:    response.sessionId,
        title:        response.title,
        messageCount: response.messageCount,
        platform:     response.platform,
        capturedAt:   response.capturedAt,
        chatUrl:      activeTab.url,
      })
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Capture failed.')
      setStatus('error')
    }
  }, [activeProjectId])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
  }, [])

  return { status, result, errorMsg, canCapture, capture, reset }
}
