import type { ReactNode } from 'react'
import { useAuthSession } from '@/auth/useAuthSession'
import { LoginForm } from './LoginForm'

/**
 * Wraps popup/App.tsx and sidepanel/App.tsx. Neither surface shares a root
 * component today, so the gate is applied to both individually rather than
 * hoisted into one entry point — kept in one shared file so the logic
 * itself isn't duplicated.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { status } = useAuthSession()

  if (status === 'loading') {
    // flex-1 min-h-0 matters when this renders inside PopupShell's flex-col
    // box (min-height, no fixed height — h-full alone can't resolve a
    // percentage against that); harmless no-op in the side panel's plain
    // (non-flex) wrapper, where h-full against #root's own height:100%
    // chain already does the job.
    return <div className="w-full h-full flex-1 min-h-0 bg-surface-1" />
  }

  if (status === 'unauthenticated') {
    return <LoginForm />
  }

  return <>{children}</>
}
