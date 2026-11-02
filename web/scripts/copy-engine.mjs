// Copies the Kotlin/JS build of billing-engine into web/engine so Vite bundles it and
// its npm dependencies resolve from web/node_modules.
// Build it first: ./gradlew :billing-engine:jsNodeProductionLibraryDistribution
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../billing-engine/build/dist/js/productionLibrary')
const target = resolve(here, '../engine')

if (!existsSync(resolve(source, 'billing-engine.mjs'))) {
  console.error(`billing-engine JS not found at ${source}`)
  console.error('Run: ./gradlew :billing-engine:jsNodeProductionLibraryDistribution')
  process.exit(1)
}
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true, filter: (path) => !path.endsWith('.map') })
console.log(`engine copied to ${target}`)
