import type { RenderRoadSlice } from '../../domain/roadFrame'

export type FreewayFurnitureAnchor = {
  id: string
  kind: 'overhead' | 'warning'
  slice: RenderRoadSlice
}

const overheadAnchors: Record<string, readonly number[]> = {
  'edge-ramp': [300],
  'edge-mainline': [900, 2400, 3900, 5400],
  'edge-exit': [180, 1080],
}

const warningAnchors: Record<string, readonly number[]> = {
  'edge-ramp': [235],
  'edge-mainline': [820, 2320, 3820, 5320],
  'edge-exit': [115, 1015],
}

function findVisibleSlice(slices: RenderRoadSlice[], edgeId: string, sM: number) {
  const candidates = slices.filter((slice) => slice.edgeId === edgeId)
  if (!candidates.length) return undefined
  const closest = candidates.reduce((best, slice) => Math.abs(slice.sM - sM) < Math.abs(best.sM - sM) ? slice : best)
  return Math.abs(closest.sM - sM) <= 5 ? closest : undefined
}

/** Fixed world anchors prevent roadside signs from recycling with the camera. */
export function buildFreewayFurnitureAnchors(slices: RenderRoadSlice[]): FreewayFurnitureAnchor[] {
  const anchors: FreewayFurnitureAnchor[] = []
  for (const [edgeId, positions] of Object.entries(overheadAnchors)) {
    for (const sM of positions) {
      const slice = findVisibleSlice(slices, edgeId, sM)
      if (slice) anchors.push({ id: `${edgeId}-overhead-${sM}`, kind: 'overhead', slice })
    }
  }
  for (const [edgeId, positions] of Object.entries(warningAnchors)) {
    for (const sM of positions) {
      const slice = findVisibleSlice(slices, edgeId, sM)
      if (slice) anchors.push({ id: `${edgeId}-warning-${sM}`, kind: 'warning', slice })
    }
  }
  return anchors
}

export function buildGuardRailPosts(slices: RenderRoadSlice[]) {
  return slices.filter((slice) => Math.abs(slice.sM / 32 - Math.round(slice.sM / 32)) < 0.08)
}
