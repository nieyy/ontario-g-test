import { describe, expect, it } from 'vitest'
import type { RenderRoadSlice } from '../../domain/roadFrame'
import { ribbonGeometry, stripGeometry } from './RoadGeometry'

const slice = (z: number): RenderRoadSlice => ({
  sM: z,
  routeDistanceM: z,
  centre: { x: 0, z },
  heading: 0,
  lanes: [],
  leftEdge: { x: -3, z },
  rightEdge: { x: 3, z },
})

describe('Three.js road geometry', () => {
  it('faces road and roadside triangles upward for the driver camera', () => {
    const road = ribbonGeometry([slice(0), slice(10)])
    const roadside = stripGeometry([{ x: -4, z: 0 }, { x: -4, z: 10 }], 1.4)
    const roadNormal = road.getAttribute('normal')
    const roadsideNormal = roadside.getAttribute('normal')

    expect(roadNormal.getY(0)).toBeGreaterThan(0)
    expect(roadsideNormal.getY(0)).toBeGreaterThan(0)
    road.dispose()
    roadside.dispose()
  })
})
