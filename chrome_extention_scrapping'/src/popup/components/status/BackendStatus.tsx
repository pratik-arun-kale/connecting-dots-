import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function BackendStatus({ online, syncing }: { online: boolean; syncing?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold',
        online
          ? 'bg-status-online/10 text-status-online'
          : 'bg-status-offline/10 text-status-offline',
      )}
    >
      <div className={cn(
        'w-1.5 h-1.5 rounded-full',
        online ? 'bg-status-online animate-pulse-dot' : 'bg-status-offline',
      )} />
      {syncing ? 'syncing' : online ? 'online' : 'offline'}
    </motion.div>
  )
}
