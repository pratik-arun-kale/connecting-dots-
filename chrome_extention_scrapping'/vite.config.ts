import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Chrome extension resource server responds with application/octet-stream
// when scripts carry the `crossorigin` attribute (CORS mode). Remove it.
function stripCrossOrigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml: (html: string) => html.replace(/ crossorigin/g, ''),
  }
}

export default defineConfig({
  plugins: [react(), stripCrossOrigin()],
  publicDir: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:     resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
