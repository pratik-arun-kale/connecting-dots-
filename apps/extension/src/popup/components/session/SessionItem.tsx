import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/motion'
import { formatRelative, truncate } from '@/lib/utils'
import { PLATFORM_DEFS } from '@/types/platform'
import type { Context } from '@/types/context'

interface SessionItemProps {
  context: Context
}

export function SessionItem({ context }: SessionItemProps) {
  const platformDef = PLATFORM_DEFS[context.platform]
  const color       = platformDef?.color ?? '#71717a'

  const handleOpen = () => {
    if (context.url) chrome.tabs.create({ url: context.url })
  }

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ x: 2, transition: { duration: 0.12 } }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-3 cursor-pointer group transition-colors duration-100"
      onClick={handleOpen}
    >
      {/* Platform color bar */}
      <div
        className="w-1 rounded-full shrink-0 self-stretch min-h-[28px]"
        style={{ backgroundColor: color }}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-1 truncate">
          {truncate(context.title, 44)}
        </p>
        <p className="text-xs text-ink-4 mt-0.5">
          {platformDef?.label ?? context.platform} · {formatRelative(context.capturedAt)}
        </p>
      </div>

      {/* Chevron — appears on hover */}
      <span className="shrink-0 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
        →
      </span>
    </motion.div>
  )
}
