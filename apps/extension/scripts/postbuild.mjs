/**
 * postbuild.mjs — copies static extension files into dist/ after Vite builds.
 */
import { copyFileSync, cpSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dist = resolve(root, 'dist')

function copy(src, dest) {
  const s = resolve(root, src)
  const d = resolve(dist, dest ?? src)
  if (!existsSync(s)) { console.warn(`[postbuild] skip (not found): ${src}`); return }
  mkdirSync(resolve(d, '..'), { recursive: true })
  try {
    cpSync(s, d, { recursive: true })
    console.log(`[postbuild] ${src} → dist/${dest ?? src}`)
  } catch (e) {
    console.error(`[postbuild] failed: ${src}:`, e.message)
  }
}

// Static HTML files (not processed by Vite)
copy('popup.html')
copy('sidepanel.html')

// Extension static assets
copy('manifest.dist.json', 'manifest.json')
copy('icons')
copy('content-scripts')

// Pre-compiled background (from root if already built, or build:bg runs after)
if (existsSync(resolve(root, 'background.js'))) {
  copyFileSync(resolve(root, 'background.js'), resolve(dist, 'background.js'))
  console.log('[postbuild] background.js')
}

console.log('[postbuild] done ✓')
