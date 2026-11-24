/**
 * src/search/hooks/useResultSelection.ts
 * ───────────────────────────────────
 * Selection State — deliberately its own hook, decoupled from
 * useConversationSearch. It only knows "an array of items and an index";
 * it has no idea a network request produced that array, so it can't be
 * accidentally coupled to loading/error state. Powers arrow-key navigation
 * and Enter-to-open over the result list (see components/ResultList.tsx),
 * following the listbox/option ARIA pattern.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useResultSelection<T>(items: T[], onOpen: (item: T) => void) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const itemRefs = useRef<Array<HTMLElement | null>>([])

  // A new result set invalidates whatever was selected in the old one.
  useEffect(() => {
    setSelectedIndex(-1)
    itemRefs.current = []
  }, [items])

  useEffect(() => {
    if (selectedIndex >= 0) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const registerItemRef = useCallback((index: number) => (el: HTMLElement | null) => {
    itemRefs.current[index] = el
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1 >= items.length ? 0 : i + 1)) // wraps
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 < 0 ? items.length - 1 : i - 1)) // wraps
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        e.preventDefault()
        onOpen(items[selectedIndex])
      }
    }
  }, [items, selectedIndex, onOpen])

  return { selectedIndex, setSelectedIndex, handleKeyDown, registerItemRef }
}
