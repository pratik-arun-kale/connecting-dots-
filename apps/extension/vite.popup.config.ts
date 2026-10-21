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
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/popup/main.tsx'),
      output: {
        format: 'iife',
        name: 'CWPopup',
        entryFileNames: 'popup.js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'assets/popup.css' : 'assets/[name][extname]',
        inlineDynamicImports: true,
      },
    },
  },
})
