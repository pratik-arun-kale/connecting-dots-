import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { scaleIn } from '@/lib/motion'
import { Button } from '../ui/Button'
import { cn } from '@/lib/utils'

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}

export function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps) {
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError('')
    setLoading(true)
    try {
      await onCreate(trimmed)
      setName('')
      onClose()
    } catch {
      setError('Failed to create project. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 z-20"
          />

          {/* Modal */}
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-30 bg-white border border-surface-5 rounded-2xl p-5 shadow-float"
          >
            <h3 className="text-md font-semibold text-ink-1 mb-1">New Project</h3>
            <p className="text-xs text-ink-3 mb-4">Give your AI workflow a name.</p>

            <form onSubmit={handleSubmit}>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Design System Research"
                maxLength={80}
                className={cn(
                  'w-full h-9 px-3 rounded-lg text-sm',
                  'bg-surface-2 border border-surface-5/70 text-ink-1',
                  'placeholder:text-ink-4 outline-none',
                  'focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
                  'transition-all duration-150 mb-3',
                )}
              />

              {error && <p className="text-xs text-status-offline mb-3">{error}</p>}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" loading={loading} disabled={!name.trim()}>
                  Create Project
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
