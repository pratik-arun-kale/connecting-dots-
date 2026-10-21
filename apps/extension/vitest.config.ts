import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Test-only config — separate from vite.popup.config.ts / vite.sidepanel.config.ts,
// which are build configs with extension-specific rollup output (iife bundles,
// dist/ layout) that don't apply to running tests under Node/jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/search/test/setup.ts'],
    css: false,
  },
})
