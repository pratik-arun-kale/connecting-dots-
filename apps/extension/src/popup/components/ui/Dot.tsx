import { cn } from '@/lib/utils'

interface DotProps {
  color?: string
  pulse?: boolean
  size?: 'sm' | 'md'
}

export function Dot({ color, pulse, size = 'sm' }: DotProps) {
  return (
    <div
      className={cn(
        'rounded-full shrink-0',
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        pulse && 'animate-pulse-dot',
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}
