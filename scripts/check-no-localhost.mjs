/**
 * check-no-localhost.mjs — fails if shipped frontend code names a local origin.
 *
 *   node scripts/check-no-localhost.mjs
 *
 * Backend and dashboard URLs belong in env files (apps/extension/.env.*,
 * apps/dashboard/.env.*), read through apps/extension/src/config.ts and
 * apps/dashboard/src/lib/env.ts. Tests are exempt: they may use local URLs
 * as fixture values.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const TARGETS = ['apps/extension/src', 'apps/extension/manifest.dist.json', 'apps/dashboard/src']
const SOURCE = /\.(ts|tsx|js|jsx|mjs|json)$/
const TEST = /\.test\.(ts|tsx|js|jsx)$|[\\/]test[\\/]/
const PATTERN = /localhost|127\.0\.0\.1/

const hits = []
for (const target of TARGETS) walk(resolve(root, target))

if (hits.length) {
  console.error('Local origins found in shipped code — move them to env config:\n')
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log('check-no-localhost: ok')

function walk(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry))
    return
  }
  if (!SOURCE.test(path) || TEST.test(path)) return
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (PATTERN.test(line)) hits.push(`${relative(root, path)}:${i + 1}: ${line.trim()}`)
  })
}
