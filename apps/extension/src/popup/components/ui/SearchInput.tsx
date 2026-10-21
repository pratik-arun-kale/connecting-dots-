import { cn } from '@/lib/utils'

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
        width="13" height="13" viewBox="0 0 13 13" fill="none"
      >
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        className={cn(
          'w-full h-8 pl-8 pr-3 rounded-lg text-sm',
          'bg-surface-2 border border-white/[0.08] text-ink-1',
          'placeholder:text-ink-4',
          'outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
          'transition-all duration-150',
          className,
        )}
        {...props}
      />
    </div>
  )
}
