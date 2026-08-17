import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const baseline = JSON.parse(readFileSync('scripts/render-budget-baseline.json', 'utf8')) as { entryGzipBytes: number; allowedIncrementBytes: number }
const assets = readdirSync('dist/assets').filter((file) => /\.(js|css)$/.test(file))
const gzipBytes = assets.reduce((total, file) => total + gzipSync(readFileSync(join('dist/assets', file))).byteLength, 0)
const limit = baseline.entryGzipBytes + baseline.allowedIncrementBytes
if (gzipBytes > limit) {
  console.error(`3D entry budget exceeded: ${gzipBytes} gzip bytes > ${limit}`)
  process.exit(1)
}
console.log(`3D bundle budget passed: ${gzipBytes} gzip bytes (${gzipBytes - baseline.entryGzipBytes} byte increment).`)
