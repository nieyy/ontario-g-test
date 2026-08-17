import * as THREE from 'three'
import type { RenderRoadSlice } from '../../domain/roadFrame'

const position = (point: { x: number; z: number }, y = 0) => [point.x, y, -point.z]

export function ribbonGeometry(slices: RenderRoadSlice[]) {
  const positions: number[] = []
  const indices: number[] = []
  for (const slice of slices) positions.push(...position(slice.leftEdge), ...position(slice.rightEdge))
  for (let index = 0; index < slices.length - 1; index += 1) {
    const offset = index * 2
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function stripGeometry(points: Array<{ x: number; z: number }>, width: number, y = 0.025) {
  const positions: number[] = []
  const indices: number[] = []
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next.x - previous.x
    const dz = next.z - previous.z
    const length = Math.hypot(dx, dz) || 1
    const nx = dz / length
    const nz = -dx / length
    positions.push(...position({ x: point.x - nx * width / 2, z: point.z - nz * width / 2 }, y))
    positions.push(...position({ x: point.x + nx * width / 2, z: point.z + nz * width / 2 }, y))
  })
  for (let index = 0; index < points.length - 1; index += 1) {
    const offset = index * 2
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
