import { cn } from '@/lib/utils'

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-micro text-ink-4 px-1 mb-2', className)}>
      {children}
    </p>
  )
}
