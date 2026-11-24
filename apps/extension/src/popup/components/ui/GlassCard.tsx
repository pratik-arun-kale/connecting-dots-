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
        'bg-white border border-surface-5/70',
        'shadow-card',
        hoverable && 'transition-all duration-150 hover:shadow-card-hover hover:border-surface-5',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}
