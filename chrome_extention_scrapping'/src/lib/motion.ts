import type { Variants, Transition } from 'framer-motion'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.18 } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.15, ease: EASE } },
}

export const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
}

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -8 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.2, ease: EASE } },
}

export const tabEnter: Transition = {
  initial:    { opacity: 0, x: 10 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -10 },
  transition: { duration: 0.18, ease: EASE },
} as unknown as Transition

export const SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const
