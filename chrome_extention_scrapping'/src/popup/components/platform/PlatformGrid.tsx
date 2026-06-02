import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { PlatformCard } from './PlatformCard'
import { SectionLabel } from '../ui/SectionLabel'
import { stagger } from '@/lib/motion'
import type { PlatformId } from '@/types/platform'

const ORDER: PlatformId[] = ['chatgpt', 'claude', 'gemini', 'perplexity']

export function PlatformGrid() {
  const platforms = useWorkspaceStore(s => s.platforms)

  return (
    <section className="px-4">
      <SectionLabel>AI Platforms</SectionLabel>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-2"
      >
        {ORDER.map(id => (
          <PlatformCard key={id} platform={platforms[id]} />
        ))}
      </motion.div>
    </section>
  )
}
