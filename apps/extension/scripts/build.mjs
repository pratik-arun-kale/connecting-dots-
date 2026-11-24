/**
 * build.mjs — builds the whole extension into dist/ for one mode.
 *
 *   node scripts/build.mjs [--mode development|staging|production]
 *
 * Reads VITE_API_URL and VITE_DASHBOARD_URL from .env.<mode> (process
 * environment and .env.<mode>.local win, as in Vite), then:
 *  1. builds the popup and the side panel with Vite,
 *  2. bundles the background service worker and the note content script
 *     with esbuild, inlining the same values through `define` (they are not
 *     Vite builds, so import.meta.env would otherwise be empty),
 *  3. copies the static files and writes dist/manifest.json from
 *     manifest.dist.json, taking the version from package.json and adding
 *     only this mode's API origin to host_permissions and only its dashboard
 *     origin to externally_connectable.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { build as esbuild } from 'esbuild'
import { build as viteBuild, loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

const modeFlag = process.argv.indexOf('--mode')
const mode = modeFlag === -1 ? 'development' : process.argv[modeFlag + 1]
const MODES = ['development', 'staging', 'production']
if (!MODES.includes(mode)) fail(`unknown mode "${mode}" (expected one of ${MODES.join(', ')})`)

// ── Config ────────────────────────────────────────────────────────────────────

const REQUIRED = ['VITE_API_URL', 'VITE_DASHBOARD_URL']
const env = loadEnv(mode, root, 'VITE_')
for (const key of REQUIRED) {
  if (!env[key]) fail(`${key} is not set for mode "${mode}" — add it to .env.${mode} (see .env.example) or the environment`)
  let url
  try {
    url = new URL(env[key])
  } catch {
    fail(`${key}="${env[key]}" is not a valid URL`)
  }
  if (mode !== 'development' && url.protocol !== 'https:') fail(`${key} must use https for a ${mode} build`)
}
const apiOrigin = new URL(env.VITE_API_URL).origin
const dashboardOrigin = new URL(env.VITE_DASHBOARD_URL).origin
const define = Object.fromEntries(REQUIRED.map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key])]))

console.log(`[build] mode=${mode} api=${env.VITE_API_URL} dashboard=${dashboardOrigin}`)

// ── 1. Popup + side panel (Vite) ──────────────────────────────────────────────

rmSync(dist, { recursive: true, force: true })
await viteBuild({ configFile: resolve(root, 'vite.popup.config.ts'), mode, logLevel: 'warn' })
await viteBuild({ configFile: resolve(root, 'vite.sidepanel.config.ts'), mode, logLevel: 'warn' })

// ── 2. Static files ───────────────────────────────────────────────────────────

for (const path of ['popup.html', 'sidepanel.html', 'icons', 'content-scripts']) {
  const src = resolve(root, path)
  if (!existsSync(src)) fail(`missing ${path}`)
  cpSync(src, resolve(dist, path), { recursive: true })
}

// ── 3. Background + note content script (esbuild) ─────────────────────────────

const common = { bundle: true, platform: 'browser', define, logLevel: 'warning' }
await esbuild({ ...common, entryPoints: [resolve(root, 'src/background.ts')], format: 'esm', outfile: resolve(dist, 'background.js') })
await esbuild({ ...common, entryPoints: [resolve(root, 'src/content/note-cs.ts')], format: 'iife', outfile: resolve(dist, 'content-scripts/note-cs.js') })

// ── 4. Manifest ───────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.dist.json'), 'utf8'))
manifest.version = pkg.version
manifest.host_permissions = [...manifest.host_permissions, `${apiOrigin}/*`]
manifest.externally_connectable = { matches: [`${dashboardOrigin}/*`] }
mkdirSync(dist, { recursive: true })
writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log(`[build] dist/ ready (v${manifest.version})`)

function fail(message) {
  console.error(`[build] ${message}`)
  process.exit(1)
}
