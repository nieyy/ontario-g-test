import * as THREE from 'three'
import type { RenderRoadSlice } from '../../domain/roadFrame'
import type { SceneQualityConfig } from './SceneQuality'

export type EnvironmentDecoration = {
  id: string
  x: number
  z: number
  side: number
  kind: 'building' | 'tree'
}

export function buildEnvironmentDecorations(slices: RenderRoadSlice[], level: SceneQualityConfig['level']): EnvironmentDecoration[] {
  const slicesByEdge = new Map<string, RenderRoadSlice[]>()
  for (const slice of slices) {
    const edgeSlices = slicesByEdge.get(slice.edgeId) ?? []
    edgeSlices.push(slice)
    slicesByEdge.set(slice.edgeId, edgeSlices)
  }
  const limit = level === 'low' ? 9 : 16
  const anchors = [...slicesByEdge.entries()].flatMap(([edgeId, unsorted]) => {
    const edgeSlices = [...unsorted].sort((left, right) => left.sM - right.sM)
    const minSM = edgeSlices[0].sM
    const maxSM = edgeSlices.at(-1)!.sM
    const firstBucket = Math.ceil((minSM - 15) / 30)
    const lastBucket = Math.floor((maxSM - 15) / 30)
    const values: Array<{ id: string; bucket: number; slice: RenderRoadSlice }> = []
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const centreM = bucket * 30 + 15
      const upperIndex = edgeSlices.findIndex((slice) => slice.sM >= centreM)
      if (upperIndex < 0) continue
      const upper = edgeSlices[upperIndex]
      const lower = edgeSlices[Math.max(0, upperIndex - 1)]
      const span = upper.sM - lower.sM
      const progress = span > 0 ? (centreM - lower.sM) / span : 0
      const point = (from: { x: number; z: number }, to: { x: number; z: number }) => ({
        x: THREE.MathUtils.lerp(from.x, to.x, progress),
        z: THREE.MathUtils.lerp(from.z, to.z, progress),
      })
      const headingDelta = Math.atan2(Math.sin(upper.heading - lower.heading), Math.cos(upper.heading - lower.heading))
      values.push({
        id: `${edgeId}:${bucket}`,
        bucket,
        slice: {
          ...lower,
          sM: centreM,
          routeDistanceM: THREE.MathUtils.lerp(lower.routeDistanceM, upper.routeDistanceM, progress),
          centre: point(lower.centre, upper.centre),
          leftEdge: point(lower.leftEdge, upper.leftEdge),
          rightEdge: point(lower.rightEdge, upper.rightEdge),
          heading: lower.heading + headingDelta * progress,
        },
      })
    }
    return values
  })
  return anchors
    .sort((left, right) => left.slice.routeDistanceM - right.slice.routeDistanceM)
    .slice(0, limit)
    .map(({ id, bucket, slice }) => {
      const side = bucket % 2 ? 1 : -1
      const edge = side > 0 ? slice.rightEdge : slice.leftEdge
      const distance = bucket % 3 === 0 ? 14 : 9
      return {
        id,
        x: edge.x + Math.cos(slice.heading) * side * distance,
        z: edge.z - Math.sin(slice.heading) * side * distance,
        side,
        kind: bucket % 3 === 0 ? 'building' : 'tree',
      }
    })
}
