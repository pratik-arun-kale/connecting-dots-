import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,   // don't wipe popup build
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/sidepanel/main.tsx'),
      output: {
        format: 'iife',
        name: 'CWSidePanel',
        entryFileNames: 'sidepanel.js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'assets/sidepanel.css' : 'assets/[name][extname]',
        inlineDynamicImports: true,
      },
    },
  },
})
