import { cn } from '@/lib/utils'

export function PopupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      'w-[420px] min-h-[500px] max-h-[580px]',
      'bg-surface-1 text-ink-1 font-sans',
      'flex flex-col overflow-hidden',
      'shadow-float',
    )}>
      {children}
    </div>
  )
}

export function ScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto scroll-hide', className)}>
      {children}
    </div>
  )
}
