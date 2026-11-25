import { DASHBOARD_URL } from '@/config'

/** Feedback and privacy, on every popup screen (signed in or not). */
export function PopupFooter() {
  const version = chrome.runtime.getManifest().version
  const link = 'hover:text-ink-1 transition-colors'
  return (
    <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-black/5 py-1.5 text-[11px] text-ink-3">
      <a href={`${DASHBOARD_URL}/feedback?from=extension&version=${encodeURIComponent(version)}`} target="_blank" rel="noreferrer" className={link}>
        Send feedback
      </a>
      <span aria-hidden>·</span>
      <a href={`${DASHBOARD_URL}/privacy`} target="_blank" rel="noreferrer" className={link}>
        Privacy
      </a>
      <span aria-hidden>·</span>
      <span>v{version}</span>
    </footer>
  )
}
