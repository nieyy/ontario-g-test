import { describe, expect, it } from 'vitest'
import { getRouteMiniMap } from './routeMiniMap'

describe('route mini-map model', () => {
  it('uses the same RouteGraph and advances within the current edge', () => {
    const start = getRouteMiniMap({ routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 0, laneId: 'mainline-centre' })
    const later = getRouteMiniMap({ routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 900, laneId: 'mainline-centre' })
    expect(start.currentEdgeIndex).toBe(6)
    expect(start.edgeCount).toBe(8)
    expect(later.vehicle).not.toEqual(start.vehicle)
    expect(later.currentLabel).toContain('three-lane')
  })
})
