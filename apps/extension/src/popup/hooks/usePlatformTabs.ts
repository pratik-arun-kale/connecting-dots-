import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { getPlatformForUrl } from '@/types/platform'
import type { PlatformId } from '@/types/platform'

export function usePlatformTabs() {
  const { resetPlatforms, updatePlatform } = useWorkspaceStore()

  useEffect(() => {
    let cancelled = false

    const detect = async () => {
      const tabs = await chrome.tabs.query({})
      if (cancelled) return

      resetPlatforms()

      const counts: Record<PlatformId, number[]> = {
        chatgpt: [], claude: [], gemini: [], perplexity: [],
      }

      for (const tab of tabs) {
        if (!tab.url) continue
        const pid = getPlatformForUrl(tab.url)
        if (pid && tab.id !== undefined) counts[pid].push(tab.id)
      }

      for (const [id, tabIds] of Object.entries(counts) as [PlatformId, number[]][]) {
        if (tabIds.length > 0) {
          updatePlatform(id, {
            connected:      true,
            activeTabCount: tabIds.length,
            tabIds,
            lastActivity:   Date.now(),
          })
        }
      }
    }

    detect()

    // Re-detect when tabs change
    const onTabUpdate = () => detect()
    chrome.tabs.onUpdated.addListener(onTabUpdate)
    chrome.tabs.onRemoved.addListener(onTabUpdate)

    return () => {
      cancelled = true
      chrome.tabs.onUpdated.removeListener(onTabUpdate)
      chrome.tabs.onRemoved.removeListener(onTabUpdate)
    }
  }, [resetPlatforms, updatePlatform])
}
