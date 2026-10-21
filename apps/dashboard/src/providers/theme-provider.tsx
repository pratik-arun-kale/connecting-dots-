'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme-store';

/**
 * The actual "no flash of wrong theme" work happens in a synchronous inline
 * script in the root layout's <head> (runs before hydration, reads
 * localStorage/system preference, applies .dark immediately). This
 * component's job is narrower:
 *  1. If the user has never explicitly chosen a theme (no persisted value),
 *     seed the store from the system preference the inline script already
 *     applied — so the toggle button starts in sync with reality.
 *  2. Keep the .dark class in sync whenever `theme` changes afterward
 *     (i.e. when the user clicks the toggle).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    let hasStored = false;
    try {
      hasStored = localStorage.getItem('cw-theme') !== null;
    } catch {
      // localStorage unavailable (private mode etc.) — fall through, treat as first visit.
    }
    if (!hasStored) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
