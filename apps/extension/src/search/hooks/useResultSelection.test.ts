import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResultSelection } from './useResultSelection'

const items = ['a', 'b', 'c']

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent
}

describe('useResultSelection', () => {
  it('starts with no selection', () => {
    const { result } = renderHook(() => useResultSelection(items, vi.fn()))
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('ArrowDown advances the selection', () => {
    const { result } = renderHook(() => useResultSelection(items, vi.fn()))
    act(() => result.current.handleKeyDown(keyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(0)
    act(() => result.current.handleKeyDown(keyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(1)
  })

  it('ArrowDown wraps from the last item back to the first', () => {
    const { result } = renderHook(() => useResultSelection(items, vi.fn()))
    act(() => result.current.setSelectedIndex(2))
    act(() => result.current.handleKeyDown(keyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(0)
  })

  it('ArrowUp wraps from the first item to the last', () => {
    const { result } = renderHook(() => useResultSelection(items, vi.fn()))
    act(() => result.current.setSelectedIndex(0))
    act(() => result.current.handleKeyDown(keyEvent('ArrowUp')))
    expect(result.current.selectedIndex).toBe(2)
  })

  it('Enter opens the currently selected item', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() => useResultSelection(items, onOpen))
    act(() => result.current.setSelectedIndex(1))
    act(() => result.current.handleKeyDown(keyEvent('Enter')))
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('Enter with no selection does nothing', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() => useResultSelection(items, onOpen))
    act(() => result.current.handleKeyDown(keyEvent('Enter')))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('resets the selection when the item array changes', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useResultSelection(list, vi.fn()),
      { initialProps: { list: items } },
    )
    act(() => result.current.setSelectedIndex(2))
    expect(result.current.selectedIndex).toBe(2)
    rerender({ list: ['x', 'y'] })
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('is a no-op on an empty item list', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() => useResultSelection([] as string[], onOpen))
    act(() => result.current.handleKeyDown(keyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(-1)
    act(() => result.current.handleKeyDown(keyEvent('Enter')))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
