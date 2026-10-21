import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrentProjectSection } from './CurrentProjectSection'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

const projectA = { id: 'a', name: 'Project A', color: '#111', sessionCount: 0, contextCount: 3, lastActive: Date.now(), status: 'active' as const, createdAt: 0 }
const projectB = { id: 'b', name: 'Project B', color: '#222', sessionCount: 0, contextCount: 0, lastActive: Date.now(), status: 'active' as const, createdAt: 0 }

describe('CurrentProjectSection', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ projects: [], activeProjectId: null })
  })

  it('shows "no active project" with no picker when there are no projects at all', () => {
    render(<CurrentProjectSection />)
    expect(screen.getByText(/no active project selected/i)).toBeInTheDocument()
    expect(screen.getByText(/open the extension icon to create one/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows a working "Choose Project" picker when projects exist but none is active', async () => {
    useWorkspaceStore.setState({ projects: [projectA, projectB], activeProjectId: null })
    const user = userEvent.setup()
    render(<CurrentProjectSection />)

    const picker = screen.getByRole('combobox', { name: /choose project/i })
    await user.selectOptions(picker, 'a')
    expect(useWorkspaceStore.getState().activeProjectId).toBe('a')
  })

  it('shows the active project name and capture count', () => {
    useWorkspaceStore.setState({ projects: [projectA], activeProjectId: 'a' })
    render(<CurrentProjectSection />)
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText(/3 captures/i)).toBeInTheDocument()
  })

  it('does not show a "Change" link when there is only one project', () => {
    useWorkspaceStore.setState({ projects: [projectA], activeProjectId: 'a' })
    render(<CurrentProjectSection />)
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument()
  })

  it('reveals a project-switch picker when "Change" is clicked, with multiple projects', async () => {
    useWorkspaceStore.setState({ projects: [projectA, projectB], activeProjectId: 'a' })
    const user = userEvent.setup()
    render(<CurrentProjectSection />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /change/i }))
    const picker = screen.getByRole('combobox', { name: /switch project/i })
    await user.selectOptions(picker, 'b')
    expect(useWorkspaceStore.getState().activeProjectId).toBe('b')
  })
})
