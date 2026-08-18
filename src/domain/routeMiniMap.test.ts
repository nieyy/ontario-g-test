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

  it('crops and enlarges the map to the active scenario edges', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-ramp', sectionId: 'highway-404-on-ramp', sMeters: 0, laneId: 'ramp-merge' }
    const model = getRouteMiniMap(position, { edgeIds: ['edge-ramp', 'edge-mainline'] })
    expect(model.edgeCount).toBe(2)
    expect(model.currentEdgeIndex).toBe(0)
    expect(Math.max(...model.points.map((point) => point.x)) - Math.min(...model.points.map((point) => point.x))).toBeGreaterThan(80)
  })
})
