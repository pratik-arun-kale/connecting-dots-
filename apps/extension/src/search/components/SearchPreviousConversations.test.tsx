import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPreviousConversations } from './SearchPreviousConversations'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { searchResultCache } from '../cache/searchCache'

const okBody = {
  query_used: 'RAG',
  corrective_triggered: false,
  chunks_indexed: 2,
  total_conversations: 1,
  conversations: [
    {
      conversation_id: 'c1',
      title: 'RAG Chunking',
      chat_url: 'https://chatgpt.com/c/1',
      provider: 'chatgpt',
      relevance_score: 3.7,
      summary: null,
      top_relevant_snippets: ['We discussed RAG chunking strategies'],
    },
  ],
}

function setActiveProject(contextCount = 5) {
  useWorkspaceStore.setState({
    activeProjectId: 'proj-1',
    projects: [{ id: 'proj-1', name: 'Test Project', color: '#000', sessionCount: 0, contextCount, lastActive: 0, status: 'active', createdAt: 0 }],
  })
}

describe('SearchPreviousConversations', () => {
  beforeEach(() => {
    searchResultCache.clear()
    useWorkspaceStore.setState({ activeProjectId: null, projects: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prompts to select a project when none is active', () => {
    render(<SearchPreviousConversations />)
    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows the search input and example chips once a project is active', () => {
    setActiveProject()
    render(<SearchPreviousConversations />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'RAG' })).toBeInTheDocument()
  })

  it('shows a "no conversations indexed" precondition state instead of the search box when the project has zero captures', () => {
    setActiveProject(0)
    render(<SearchPreviousConversations />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByText(/no conversations indexed yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture current chat/i })).toBeInTheDocument()
  })

  it('collapses and expands the section on header click', async () => {
    setActiveProject()
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /search previous conversations/i }))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /search previous conversations/i }))
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('runs a search and renders a result card when an example chip is clicked', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.click(screen.getByRole('button', { name: 'RAG' }))

    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())
    expect(screen.getByText(/1 conversation found/i)).toBeInTheDocument()
  })

  it('Escape clears the query and results', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.click(screen.getByRole('button', { name: 'RAG' }))
    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())

    await user.type(screen.getByRole('searchbox'), '{Escape}')
    expect(screen.queryByText('RAG Chunking')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('shows an empty state with "did you mean" suggestions on zero results', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query_used: 'nvidai',
      corrective_triggered: false,
      chunks_indexed: 0,
      total_conversations: 0,
      conversations: [],
      suggestions: {
        closest_topics: ['NVIDIA'],
        closest_technologies: [],
        related_conversations: [],
        closest_projects: [],
      },
    }), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), 'nvidai{Enter}')
    await waitFor(() => expect(screen.getByText(/no conversations matched/i)).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: 'NVIDIA' })).toBeInTheDocument()
  })

  it('BUG FIX: typing does not trigger a search — only Enter or the search button do', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), 'rag chunking')
    // Give any (incorrectly) scheduled async work a chance to fire.
    await new Promise(r => setTimeout(r, 400))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByText('RAG Chunking')).not.toBeInTheDocument()
  })

  it('BUG FIX: clicking the search button fires exactly one request', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), 'rag chunking')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('BUG FIX: pressing Enter fires exactly one request', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), 'rag chunking{Enter}')

    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('BUG FIX: pressing Enter repeatedly on an unchanged, already-running search does not duplicate the request', async () => {
    setActiveProject()
    let resolveFetch: ((r: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    const input = screen.getByRole('searchbox')
    await user.type(input, 'rag chunking{Enter}')
    await user.type(input, '{Enter}')
    await user.type(input, '{Enter}')

    expect(fetch).toHaveBeenCalledTimes(1)
    resolveFetch?.(new Response(JSON.stringify(okBody), { status: 200 }))
    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())
  })

  it('BUG FIX: an empty query makes no request whether via Enter or the search button', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn())
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), '{Enter}')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(fetch).not.toHaveBeenCalled()
  })

  it('BUG FIX: editing the query after a search keeps the previous results visible until submitted again', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.type(screen.getByRole('searchbox'), 'rag chunking{Enter}')
    await waitFor(() => expect(screen.getByText('RAG Chunking')).toBeInTheDocument())

    await user.type(screen.getByRole('searchbox'), ' extra text')
    // No new request yet, and the old result is still shown.
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('RAG Chunking')).toBeInTheDocument()
  })

  it('shows a retryable error state when the backend returns a 500', async () => {
    setActiveProject()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    const user = userEvent.setup()
    render(<SearchPreviousConversations />)

    await user.click(screen.getByRole('button', { name: 'FastAPI' }))
    await waitFor(() => expect(screen.getByText(/search failed/i)).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
