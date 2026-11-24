import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60)  return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

/**
 * Opens the real docked side panel (where "Search Previous Conversations"
 * lives) from the popup. `chrome.sidePanel.open()` requires a concrete
 * windowId/tabId — passing none makes Chrome reject the call — so this
 * looks up the current window first. Falls back to opening sidepanel.html
 * as a plain tab if the Side Panel API call fails for any reason (older
 * Chrome, API unavailable), so the feature is still reachable either way.
 */
export async function openSidePanel(): Promise<void> {
  try {
    const win = await chrome.windows.getCurrent()
    if (win.id === undefined) throw new Error('no current window id')
    await chrome.sidePanel.open({ windowId: win.id })
  } catch {
    chrome.tabs.create({ url: `chrome-extension://${chrome.runtime.id}/sidepanel.html` })
  }
}
