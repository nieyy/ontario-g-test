import { describe, expect, it } from 'vitest'
import { buildRoadFrame, type RenderRoadSlice } from '../../domain/roadFrame'
import { buildEnvironmentDecorations } from './EnvironmentDecorations'
import { ribbonGeometry, stripGeometry } from './RoadGeometry'

const slice = (z: number): RenderRoadSlice => ({
  edgeId: 'test-edge',
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

  it('keeps roadside objects anchored to the road section instead of recycling them relative to the car', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-local', sectionId: 'harry-walker-local', laneId: 'local-forward' }
    const first = buildEnvironmentDecorations(buildRoadFrame({ position: { ...position, sMeters: 80 } }).slices, 'medium')
    const advanced = buildEnvironmentDecorations(buildRoadFrame({ position: { ...position, sMeters: 88 } }).slices, 'medium')
    const sharedIds = first.map((item) => item.id).filter((id) => advanced.some((item) => item.id === id))

    expect(sharedIds.length).toBeGreaterThan(0)
    for (const id of sharedIds) {
      const before = first.find((item) => item.id === id)!
      const after = advanced.find((item) => item.id === id)!
      expect(after.x).toBe(before.x)
      expect(after.z).toBe(before.z)
      expect(after.kind).toBe(before.kind)
    }
  })
})
