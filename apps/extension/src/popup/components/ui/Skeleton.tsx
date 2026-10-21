import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-3', className)} />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl bg-surface-2 border border-white/[0.06] p-4 space-y-2.5', className)}>
      <Skeleton className="w-16 h-2" />
      <Skeleton className="w-3/4 h-4" />
      <Skeleton className="w-1/2 h-2" />
    </div>
  )
}
