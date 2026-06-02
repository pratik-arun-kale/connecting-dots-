import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Platform } from '@/types/platform'

interface PlatformCardProps {
  platform: Platform
}

export function PlatformCard({ platform }: PlatformCardProps) {
  const { label, color, url, connected, activeTabCount } = platform

  const handleOpen = () => chrome.tabs.create({ url })

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.97 }}
      onClick={handleOpen}
      className="rounded-xl p-3 cursor-pointer bg-surface-2 border border-white/[0.08] hover:bg-surface-3 hover:border-white/[0.12] transition-colors duration-150 group"
    >
      {/* Top row: icon + status */}
      <div className="flex items-center justify-between mb-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
          style={{ background: color + '1a', color }}
        >
          {label.charAt(0)}
        </div>
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            connected ? 'bg-status-online animate-pulse-dot' : 'bg-surface-5',
          )}
        />
      </div>

      <p className="text-sm font-semibold text-ink-1 mb-0.5">{label}</p>
      <p className="text-xs text-ink-4">
        {connected ? `${activeTabCount} tab${activeTabCount !== 1 ? 's' : ''}` : 'Click to open'}
      </p>
    </motion.div>
  )
}
