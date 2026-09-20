import { useState, type FormEvent } from 'react'
import { login } from '@/auth/authService'
import { notifyAuthChanged } from '@/auth/useAuthSession'
import { Button } from '@/popup/components/ui/Button'
import { GlassCard } from '@/popup/components/ui/GlassCard'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-surface-5 bg-white text-sm text-ink-1 ' +
  'placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(email, password)
      notifyAuthChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full h-full flex-1 min-h-0 flex items-center justify-center p-6 bg-surface-1">
      <GlassCard className="w-full max-w-xs" hoverable={false}>
        <div className="mb-4 text-center">
          <div className="w-8 h-8 mx-auto mb-2 rounded-md bg-ink-1 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.95" />
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.95" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink-1">Sign in</p>
          <p className="text-xs text-ink-4 mt-0.5">Connect this extension to your workspace.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={pending} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="text-[11px] text-ink-4 text-center mt-4">
          No account?{' '}
          <a
            href="http://localhost:3000/register"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent font-medium hover:underline"
          >
            Create one in the dashboard
          </a>
        </p>
      </GlassCard>
    </div>
  )
}
