import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingSteps } from './OnboardingSteps'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

describe('OnboardingSteps', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      hasSeenOnboarding: false,
      activeProjectId: null,
      contexts: [],
    })
  })

  it('renders all four steps for a brand-new user', () => {
    render(<OnboardingSteps />)
    expect(screen.getByText('Choose a project')).toBeInTheDocument()
    expect(screen.getByText('Capture conversations')).toBeInTheDocument()
    expect(screen.getByText('Search previous conversations')).toBeInTheDocument()
    expect(screen.getByText('Ask AI about your knowledge')).toBeInTheDocument()
  })

  it('renders nothing once hasSeenOnboarding is true', () => {
    useWorkspaceStore.setState({ hasSeenOnboarding: true })
    const { container } = render(<OnboardingSteps />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismisses permanently when the close button is clicked', async () => {
    const user = userEvent.setup()
    render(<OnboardingSteps />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(useWorkspaceStore.getState().hasSeenOnboarding).toBe(true)
  })

  it('auto-dismisses once the user has captured at least one conversation', () => {
    useWorkspaceStore.setState({ contexts: [{ id: 'c1' }] as never })
    render(<OnboardingSteps />)
    expect(useWorkspaceStore.getState().hasSeenOnboarding).toBe(true)
  })

  it('marks "Choose a project" done once a project is active, without dismissing the whole guide', () => {
    useWorkspaceStore.setState({ activeProjectId: 'p1' })
    render(<OnboardingSteps />)
    expect(useWorkspaceStore.getState().hasSeenOnboarding).toBe(false)
    expect(screen.getByText('Choose a project')).toHaveClass('line-through')
  })
})
