/**
 * src/search/utils/openChat.ts
 * ───────────────────────────────────
 * "Open Chat" is reachable two ways — the button on a ResultCard, and
 * pressing Enter on a keyboard-selected result (useResultSelection) — so the
 * actual opening logic lives here once instead of being duplicated in both
 * places. Always opens in a NEW tab (chrome.tabs.create with active:true),
 * deliberately preserving whatever chat the user currently has open.
 */
import { isValidHttpUrl } from './sanitize'

export function openChatUrl(url: string | null): { ok: true } | { ok: false; message: string } {
  if (!isValidHttpUrl(url)) {
    return { ok: false, message: 'This conversation has no valid link to open.' }
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url, active: true })
    } else {
      // Outside a real extension context (component tests, a future web build) — best-effort fallback.
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not open this conversation. Try again.' }
  }
}
