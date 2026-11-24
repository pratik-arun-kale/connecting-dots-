import { useEffect } from 'react'

/**
 * The extension shell (tailwind.config.ts) declares `darkMode: 'class'` but,
 * before this feature, nothing ever toggled a `.dark` class — none of the
 * existing screens use `dark:` utilities, so this was silently inert. This
 * hook actually wires it up by mirroring the OS-level color scheme onto
 * `<html>`. It's mounted once at each entry point's root (SidePanelApp).
 * Safe to add: since no existing markup uses `dark:` classes, toggling this
 * class cannot change how any existing screen renders — only the new search
 * components (which do use `dark:` utilities) are affected.
 */
export function useSystemTheme(): void {
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark)
    }
    apply(mql.matches)
    const listener = (e: MediaQueryListEvent) => apply(e.matches)
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [])
}
