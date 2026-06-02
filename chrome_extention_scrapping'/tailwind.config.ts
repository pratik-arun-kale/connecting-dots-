import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './popup.html',
    './sidepanel.html',
    './src/popup/**/*.{ts,tsx}',
    './src/sidepanel/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0:   '#0a0a0b',
          1:   '#111113',
          2:   '#18181b',
          3:   '#1f1f23',
          4:   '#27272c',
          5:   '#2e2e34',
        },
        ink: {
          1: '#f4f4f5',
          2: '#a1a1aa',
          3: '#71717a',
          4: '#52525b',
        },
        accent: {
          DEFAULT: '#6366f1',
          muted:   'rgba(99,102,241,0.15)',
          glow:    'rgba(99,102,241,0.25)',
        },
        status: {
          online:  '#22c55e',
          offline: '#ef4444',
          syncing: '#f59e0b',
          idle:    '#71717a',
        },
        platform: {
          chatgpt:    '#10a37f',
          claude:     '#d97706',
          gemini:     '#4285f4',
          perplexity: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"',
          '"Inter"', 'system-ui', 'sans-serif',
        ],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        'xs':  ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'sm':  ['12px', { lineHeight: '18px' }],
        'base':['13px', { lineHeight: '20px' }],
        'md':  ['14px', { lineHeight: '22px' }],
        'lg':  ['16px', { lineHeight: '24px' }],
        'xl':  ['18px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '2xl': ['22px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'xs':  '6px',
        'sm':  '8px',
        'md':  '12px',
        'lg':  '16px',
        'xl':  '20px',
        '2xl': '24px',
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(99,102,241,0.2)',
        'glow-sm':     '0 0 10px rgba(99,102,241,0.15)',
        'card':        '0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
        'card-hover':  '0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5)',
        'float':       '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        'inset-top':   'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        'shimmer': {
          from: { backgroundPosition: '-400% 0' },
          to:   { backgroundPosition: '400% 0' },
        },
      },
      animation: {
        'fade-in':   'fade-in 0.2s ease-out',
        'scale-in':  'scale-in 0.15s ease-out',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'shimmer':   'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
