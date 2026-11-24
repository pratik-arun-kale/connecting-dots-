import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AskAICard } from './AskAICard'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

describe('AskAICard', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeProjectId: null })
  })

  it('disables the link and explains why when no project is active', () => {
    render(<AskAICard />)
    expect(screen.getByRole('button', { name: /open ask ai in dashboard/i })).toBeDisabled()
    expect(screen.getByText(/select a project to ask questions/i)).toBeInTheDocument()
  })

  it('opens the dashboard\'s Ask AI tab for the active project when clicked', async () => {
    useWorkspaceStore.setState({ activeProjectId: 'proj-42' })
    const createSpy = vi.fn()
    ;(globalThis as unknown as { chrome: { tabs: { create: typeof createSpy } } }).chrome.tabs.create = createSpy

    const user = userEvent.setup()
    render(<AskAICard />)
    await user.click(screen.getByRole('button', { name: /open ask ai in dashboard/i }))

    expect(createSpy).toHaveBeenCalledWith({
      url: 'http://localhost:3000/projects/proj-42?tab=ask',
      active: true,
    })
  })
})
