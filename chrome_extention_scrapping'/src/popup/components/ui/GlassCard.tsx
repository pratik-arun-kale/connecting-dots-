import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export function GlassCard({ children, className, onClick, hoverable = true }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl p-4',
        'bg-surface-2 border border-white/[0.08]',
        'shadow-card',
        hoverable && 'transition-all duration-150 hover:bg-surface-3 hover:shadow-card-hover hover:border-white/[0.12]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}
