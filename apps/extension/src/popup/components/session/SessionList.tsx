import { motion } from 'framer-motion'
import { stagger } from '@/lib/motion'
import { SessionItem } from './SessionItem'
import { SectionLabel } from '../ui/SectionLabel'
import { Skeleton } from '../ui/Skeleton'
import type { Context } from '@/types/context'

interface SessionListProps {
  contexts: Context[]
  loading?: boolean
}

export function SessionList({ contexts, loading }: SessionListProps) {
  if (loading) {
    return (
      <section className="px-4">
        <SectionLabel>Recent Captures</SectionLabel>
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      </section>
    )
  }

  if (contexts.length === 0) {
    return (
      <section className="px-4">
        <SectionLabel>Recent Captures</SectionLabel>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-surface-3 border border-white/[0.06] flex items-center justify-center mb-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M3 8h6M3 12h4" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-ink-3">No captures yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-[180px]">
            Open ChatGPT or Claude, then use the extension to save context.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="px-4">
      <SectionLabel>Recent Captures</SectionLabel>
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-0.5">
        {contexts.slice(0, 6).map(ctx => (
          <SessionItem key={ctx.id} context={ctx} />
        ))}
      </motion.div>
    </section>
  )
}
