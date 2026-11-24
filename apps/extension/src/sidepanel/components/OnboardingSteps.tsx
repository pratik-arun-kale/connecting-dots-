import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { fadeIn } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface Step {
  label: string
  done: boolean
}

/**
 * First-run guidance — shown once, until the user either dismisses it or
 * makes real progress (captures their first conversation). Steps 1-2 reflect
 * actual state (active project / at least one capture); 3-4 are aspirational
 * pointers to where Search and Ask AI live, since "has searched" / "has
 * asked" aren't state worth tracking just for an onboarding checklist.
 */
export function OnboardingSteps() {
  const hasSeenOnboarding = useWorkspaceStore(s => s.hasSeenOnboarding)
  const dismissOnboarding = useWorkspaceStore(s => s.dismissOnboarding)
  const hasProject = useWorkspaceStore(s => s.activeProjectId !== null)
  const hasCaptures = useWorkspaceStore(s => s.contexts.length > 0)

  // "Disappear after setup" — once the user has captured something, they're
  // past onboarding by definition; no need to keep prompting.
  useEffect(() => {
    if (hasCaptures && !hasSeenOnboarding) dismissOnboarding()
  }, [hasCaptures, hasSeenOnboarding, dismissOnboarding])

  if (hasSeenOnboarding) return null

  const steps: Step[] = [
    { label: 'Choose a project', done: hasProject },
    { label: 'Capture conversations', done: hasCaptures },
    { label: 'Search previous conversations', done: false },
    { label: 'Ask AI about your knowledge', done: false },
  ]

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      className="rounded-xl border border-accent/20 bg-accent-muted dark:bg-accent/[0.08] p-3"
      role="region"
      aria-label="Getting started"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs font-semibold text-accent uppercase tracking-wide">Getting Started</span>
        <button
          type="button"
          onClick={dismissOnboarding}
          aria-label="Dismiss getting-started guide"
          className="text-ink-4 dark:text-white/40 hover:text-ink-2 dark:hover:text-white/70 transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                step.done
                  ? 'bg-status-online text-white'
                  : 'bg-white dark:bg-white/10 border border-accent/30 text-accent',
              )}
            >
              {step.done ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4l2 2 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={cn(
              'text-xs',
              step.done ? 'text-ink-3 dark:text-white/50 line-through' : 'text-ink-1 dark:text-white',
            )}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </motion.div>
  )
}
