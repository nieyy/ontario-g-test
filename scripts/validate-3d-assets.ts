import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['src/rendering/three', 'src/components/ThreeRoadScene.tsx']
const files: string[] = []
function collect(path: string) {
  if (statSync(path).isDirectory()) for (const child of readdirSync(path)) collect(join(path, child))
  else files.push(path)
}
roots.forEach(collect)
const forbidden = [/https?:\/\//, /\.gltf\b/i, /\.glb\b/i, /street\s*view/i, /google\s*maps/i]
const errors = files.flatMap((file) => {
  const content = readFileSync(file, 'utf8')
  return forbidden.filter((pattern) => pattern.test(content)).map((pattern) => `${file}: forbidden runtime asset reference ${pattern}`)
})
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Validated ${files.length} programmatic 3D source files; no remote model or texture assets.`)
