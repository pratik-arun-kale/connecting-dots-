import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'ghost' | 'surface'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ children, className, variant = 'accent', size = 'md', loading, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled || loading ? {} : { scale: 1.02, y: -1 }}
      whileTap={disabled  || loading ? {} : { scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(
        'relative flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-colors duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'accent' && 'bg-accent text-white shadow-glow-sm hover:bg-accent/90',
        variant === 'ghost'  && 'bg-transparent text-ink-2 hover:bg-surface-3 hover:text-ink-1',
        variant === 'surface'&& 'bg-surface-3 text-ink-1 hover:bg-surface-4 border border-white/[0.08]',
        className,
      )}
      {...(props as object)}
    >
      {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : children}
    </motion.button>
  )
}
