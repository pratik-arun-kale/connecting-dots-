import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './popup.html',
    './sidepanel.html',
    './src/popup/**/*.{ts,tsx}',
    './src/sidepanel/**/*.{ts,tsx}',
    './src/search/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#ffffff',
          1: '#ffffff',
          2: '#f5f5f7',
          3: '#f2f2f2',
          4: '#e8e8ed',
          5: '#d2d2d7',
        },
        ink: {
          1: '#1d1d1f',
          2: '#6e6e73',
          3: '#86868b',
          4: '#ababab',
        },
        accent: {
          DEFAULT: '#0071e3',
          muted:   'rgba(0,113,227,0.08)',
          glow:    'rgba(0,113,227,0.15)',
        },
        status: {
          online:  '#34c759',
          offline: '#ff3b30',
          syncing: '#ff9500',
          idle:    '#ababab',
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
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"',
          'system-ui', 'sans-serif',
        ],
        mono: ['"SF Mono"', '"Menlo"', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.02em' }],
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
        'md':  '10px',
        'lg':  '12px',
        'xl':  '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'card':        '0 1px 3px rgba(0,0,0,0.06), 0 1px 8px rgba(0,0,0,0.04)',
        'card-hover':  '0 2px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
        'float':       '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
        'inset-top':   'inset 0 1px 0 rgba(0,0,0,0.04)',
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
          '50%':      { opacity: '0.4' },
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
